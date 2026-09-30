import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { getSessionUser } from "@/lib/auth";

export const dynamic = "force-dynamic";

type RangeKey = "today" | "week" | "month";

function getRangeBounds(range: RangeKey) {
  const to = new Date();
  const from = new Date(to);
  if (range === "today") {
    from.setHours(0, 0, 0, 0);
  } else if (range === "week") {
    from.setDate(from.getDate() - 6);
    from.setHours(0, 0, 0, 0);
  } else {
    from.setDate(1);
    from.setHours(0, 0, 0, 0);
  }
  return { from, to };
}

/** Near-expiry look-ahead window grows with the selected period. */
const EXPIRY_HORIZON_DAYS: Record<RangeKey, number> = {
  today: 7,
  week: 30,
  month: 90,
};

/**
 * Cashier reception / remaining-stock report.
 * remaining = total confirmed received − total POS sold (per product).
 */
export async function GET(request: Request) {
  try {
    const { searchParams } = new URL(request.url);
    const rangeParam = (searchParams.get("range") || "week") as RangeKey;
    const range: RangeKey = ["today", "week", "month"].includes(rangeParam)
      ? rangeParam
      : "week";
    const { from, to } = getRangeBounds(range);

    const session = await getSessionUser();
    let pharmacyId =
      searchParams.get("pharmacyId") || session?.pharmacyId || null;

    if (pharmacyId) {
      const exists = await prisma.pharmacy.findUnique({
        where: { id: pharmacyId },
        select: { id: true },
      });
      if (!exists) pharmacyId = null;
    }

    if (!pharmacyId) {
      const first = await prisma.pharmacy.findFirst({
        orderBy: { createdAt: "asc" },
        select: { id: true },
      });
      pharmacyId = first?.id ?? null;
    }

    if (!pharmacyId) {
      return NextResponse.json(
        { error: "تعذر تحديد الصيدلية لتقرير الاستلام" },
        { status: 400 }
      );
    }

    const horizonDays = EXPIRY_HORIZON_DAYS[range];
    const expiryHorizon = new Date(to);
    expiryHorizon.setDate(expiryHorizon.getDate() + horizonDays);

    const [
      confirmedAll,
      confirmedPeriod,
      salesAll,
      salesPeriod,
      liveBatches,
      expiringBatches,
    ] = await Promise.all([
        prisma.orderItem.findMany({
          where: {
            order: {
              pharmacyId,
              status: "CONFIRMED",
            },
          },
          include: {
            product: { select: { id: true, name: true, unitType: true } },
            order: { select: { confirmedAt: true, orderNumber: true } },
          },
        }),
        prisma.orderItem.findMany({
          where: {
            order: {
              pharmacyId,
              status: "CONFIRMED",
              confirmedAt: { gte: from, lte: to },
            },
          },
          include: {
            product: { select: { id: true, name: true, unitType: true } },
            order: {
              select: {
                confirmedAt: true,
                orderNumber: true,
                createdAt: true,
              },
            },
          },
        }),
        prisma.saleItem.findMany({
          where: {
            sale: { pharmacyId },
          },
          select: {
            productId: true,
            productName: true,
            quantity: true,
            unitType: true,
            sale: { select: { createdAt: true } },
          },
        }),
        prisma.saleItem.findMany({
          where: {
            sale: {
              pharmacyId,
              createdAt: { gte: from, lte: to },
            },
          },
          select: {
            productId: true,
            productName: true,
            quantity: true,
            unitType: true,
          },
        }),
        prisma.stockBatch.findMany({
          where: {
            pharmacyId,
            quantity: { gt: 0 },
          },
          select: {
            productId: true,
            quantity: true,
            product: { select: { name: true, unitType: true } },
          },
        }),
        prisma.stockBatch.findMany({
          where: {
            pharmacyId,
            quantity: { gt: 0 },
            expiryDate: { lte: expiryHorizon },
          },
          select: {
            id: true,
            batchNumber: true,
            quantity: true,
            costPrice: true,
            expiryDate: true,
            product: { select: { name: true, unitType: true } },
          },
          orderBy: { expiryDate: "asc" },
        }),
      ]);

    type Acc = {
      productId: string;
      productName: string;
      unitType: string;
      receivedAll: number;
      receivedPeriod: number;
      soldAll: number;
      soldPeriod: number;
      pharmacyStock: number;
      lastReceivedAt: Date | null;
      lastSoldAt: Date | null;
    };

    const later = (a: Date | null, b: Date | null | undefined) =>
      !b ? a : !a || b > a ? b : a;

    const map = new Map<string, Acc>();

    const ensure = (
      productId: string,
      productName: string,
      unitType: string
    ) => {
      let row = map.get(productId);
      if (!row) {
        row = {
          productId,
          productName,
          unitType,
          receivedAll: 0,
          receivedPeriod: 0,
          soldAll: 0,
          soldPeriod: 0,
          pharmacyStock: 0,
          lastReceivedAt: null,
          lastSoldAt: null,
        };
        map.set(productId, row);
      }
      return row;
    };

    for (const item of confirmedAll) {
      const row = ensure(
        item.productId,
        item.product?.name ?? "منتج",
        item.unitType
      );
      row.receivedAll += item.quantity;
      row.lastReceivedAt = later(row.lastReceivedAt, item.order.confirmedAt);
    }

    for (const item of confirmedPeriod) {
      const row = ensure(
        item.productId,
        item.product?.name ?? "منتج",
        item.unitType
      );
      row.receivedPeriod += item.quantity;
    }

    for (const item of salesAll) {
      const row = ensure(
        item.productId,
        item.productName || "منتج",
        item.unitType
      );
      row.soldAll += item.quantity;
      row.lastSoldAt = later(row.lastSoldAt, item.sale?.createdAt);
    }

    for (const item of salesPeriod) {
      const row = ensure(
        item.productId,
        item.productName || "منتج",
        item.unitType
      );
      row.soldPeriod += item.quantity;
    }

    for (const batch of liveBatches) {
      const row = ensure(
        batch.productId,
        batch.product.name,
        batch.product.unitType
      );
      row.pharmacyStock += batch.quantity;
    }

    const products = Array.from(map.values())
      .map((row) => {
        // المتبقي الحالي = إجمالي المستلم المؤكد − إجمالي المباع
        const remaining = Math.max(0, row.receivedAll - row.soldAll);
        return {
          productId: row.productId,
          productName: row.productName,
          unitType: row.unitType,
          receivedPeriod: row.receivedPeriod,
          soldPeriod: row.soldPeriod,
          receivedAll: row.receivedAll,
          soldAll: row.soldAll,
          remaining,
          pharmacyStock: row.pharmacyStock,
        };
      })
      .filter(
        (row) =>
          row.receivedPeriod > 0 ||
          row.soldPeriod > 0 ||
          row.remaining > 0 ||
          row.pharmacyStock > 0
      )
      .sort((a, b) => a.productName.localeCompare(b.productName, "ar"));

    const summary = {
      totalReceivedPeriod: products.reduce((s, p) => s + p.receivedPeriod, 0),
      totalSoldPeriod: products.reduce((s, p) => s + p.soldPeriod, 0),
      totalRemaining: products.reduce((s, p) => s + p.remaining, 0),
      productCount: products.length,
    };

    // Out of stock: products with pharmacy activity (confirmed receipts or POS
    // sales) whose remaining (total confirmed received − total POS sold) is zero.
    const outOfStock = Array.from(map.values())
      .filter(
        (row) =>
          (row.receivedAll > 0 || row.soldAll > 0) &&
          row.receivedAll - row.soldAll <= 0
      )
      .map((row) => {
        const depletedAt = later(row.lastReceivedAt, row.lastSoldAt);
        return {
          productId: row.productId,
          productName: row.productName,
          unitType: row.unitType,
          receivedAll: row.receivedAll,
          soldAll: row.soldAll,
          lastSoldAt: row.lastSoldAt?.toISOString() ?? null,
          depletedAt: depletedAt?.toISOString() ?? null,
        };
      })
      .sort((a, b) => a.productName.localeCompare(b.productName, "ar"));

    const nowMs = to.getTime();
    const expiring = expiringBatches.map((b) => {
      const expiryMs = b.expiryDate.getTime();
      return {
        batchId: b.id,
        batchNumber: b.batchNumber,
        productName: b.product.name,
        unitType: b.product.unitType,
        quantity: b.quantity,
        costPrice: Number(b.costPrice),
        expiryDate: b.expiryDate.toISOString(),
        daysLeft: Math.ceil((expiryMs - nowMs) / 86_400_000),
        expired: expiryMs < nowMs,
      };
    });

    const receipts = confirmedPeriod.map((item) => ({
      orderNumber: item.order.orderNumber,
      confirmedAt:
        item.order.confirmedAt?.toISOString() ??
        item.order.createdAt.toISOString(),
      productName: item.product?.name ?? "منتج",
      quantity: item.quantity,
      unitType: item.unitType,
    }));

    return NextResponse.json({
      mode: "database",
      range,
      from: from.toISOString(),
      to: to.toISOString(),
      pharmacyId,
      summary,
      products,
      receipts,
      outOfStock,
      expiring,
      expiryHorizonDays: horizonDays,
    });
  } catch (error) {
    console.error("[GET /api/reception-report]", error);
    const message =
      error instanceof Error ? error.message : "فشل جلب تقرير الاستلام";
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
