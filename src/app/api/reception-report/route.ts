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

    const [confirmedAll, confirmedPeriod, salesAll, salesPeriod, liveBatches] =
      await Promise.all([
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
    };

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
    });
  } catch (error) {
    console.error("[GET /api/reception-report]", error);
    const message =
      error instanceof Error ? error.message : "فشل جلب تقرير الاستلام";
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
