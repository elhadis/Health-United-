import { NextResponse } from "next/server";
import type { UnitType, PaymentMethod } from "@prisma/client";
import { prisma } from "@/lib/prisma";
import {
  addDemoSale,
  decrementDemoStock,
  demoSales,
} from "@/lib/demo-data";
import { getSessionUser, requireAdministratorForDelete } from "@/lib/auth";
import { generateReceiptNumber } from "@/lib/utils";

export const dynamic = "force-dynamic";

const VALID_UNITS: UnitType[] = [
  "BOX",
  "CARTON",
  "BOTTLE",
  "INJECTABLE",
  "VIAL",
  "ML",
  "STRIP",
  "CATHETER",
  "DRIP",
];

async function resolvePharmacyId(requested?: string | null) {
  const session = await getSessionUser();
  let pharmacyId = requested || session?.pharmacyId || null;

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

  return pharmacyId;
}

async function resolveCashierId(requested?: string | null) {
  const session = await getSessionUser();
  const cashierId = requested || session?.id || null;
  if (!cashierId) return null;
  const exists = await prisma.user.findUnique({
    where: { id: cashierId },
    select: { id: true },
  });
  return exists?.id ?? null;
}

export async function GET(request: Request) {
  const { searchParams } = new URL(request.url);
  const pharmacyId = searchParams.get("pharmacyId");
  const from = searchParams.get("from");
  const to = searchParams.get("to");

  try {
    const sales = await prisma.sale.findMany({
      where: {
        ...(pharmacyId ? { pharmacyId } : {}),
        ...(from || to
          ? {
              createdAt: {
                ...(from ? { gte: new Date(from) } : {}),
                ...(to ? { lte: new Date(to) } : {}),
              },
            }
          : {}),
      },
      include: { items: true, cashier: true, pharmacy: true },
      orderBy: { createdAt: "desc" },
      take: 100,
    });
    return NextResponse.json({ mode: "database", sales });
  } catch {
    let sales = demoSales;
    if (from) sales = sales.filter((s) => s.createdAt >= from);
    if (to) sales = sales.filter((s) => s.createdAt <= to);
    return NextResponse.json({ mode: "demo", sales });
  }
}

export async function POST(request: Request) {
  try {
    const body = await request.json();
    const {
      paymentMethod,
      bankAppName,
      transactionRef,
      items,
      clientId,
      isOffline = false,
      createdAt,
    } = body;

    if (!items?.length) {
      return NextResponse.json({ error: "السلة فارغة" }, { status: 400 });
    }

    if (paymentMethod !== "CASH" && paymentMethod !== "BANK_APP") {
      return NextResponse.json({ error: "طريقة الدفع غير صالحة" }, { status: 400 });
    }

    const subtotal = items.reduce(
      (sum: number, i: { unitPrice: number; quantity: number }) =>
        sum + Number(i.unitPrice) * Number(i.quantity),
      0
    );
    const totalCost = items.reduce(
      (sum: number, i: { costPrice: number; quantity: number }) =>
        sum + Number(i.costPrice) * Number(i.quantity),
      0
    );
    const profit = subtotal - totalCost;

    try {
      const pharmacyId = await resolvePharmacyId(body.pharmacyId);
      if (!pharmacyId) {
        return NextResponse.json(
          { error: "تعذر تحديد الصيدلية لإتمام البيع" },
          { status: 400 }
        );
      }

      const cashierId = await resolveCashierId(body.cashierId);

      const sale = await prisma.$transaction(async (tx) => {
        const normalizedItems = [];

        for (const item of items) {
          const quantity = Math.floor(Number(item.quantity));
          if (!Number.isFinite(quantity) || quantity <= 0) {
            throw new Error(`كمية غير صالحة للمنتج ${item.productName || item.productId}`);
          }

          const product = await tx.product.findUnique({
            where: { id: item.productId },
            select: { id: true, name: true, unitType: true, costPrice: true },
          });
          if (!product) {
            throw new Error(`المنتج غير موجود: ${item.productName || item.productId}`);
          }

          let batchId: string | null = item.batchId || null;
          if (batchId) {
            const batch = await tx.stockBatch.findUnique({
              where: { id: batchId },
              select: { id: true, quantity: true, pharmacyId: true },
            });
            // Only honor explicit batch if it belongs to this pharmacy and has stock
            if (
              !batch ||
              batch.quantity < quantity ||
              batch.pharmacyId !== pharmacyId
            ) {
              batchId = null;
            }
          }

          // Prefer this pharmacy's stock; FEFO across batches when needed
          if (!batchId) {
            const pharmacyBatches = await tx.stockBatch.findMany({
              where: {
                productId: product.id,
                quantity: { gt: 0 },
                pharmacyId,
              },
              orderBy: { expiryDate: "asc" },
            });
            const pharmacyAvailable = pharmacyBatches.reduce(
              (s, b) => s + b.quantity,
              0
            );

            if (pharmacyAvailable >= quantity) {
              let remaining = quantity;
              let primaryBatchId: string | null = null;
              for (const batch of pharmacyBatches) {
                if (remaining <= 0) break;
                const take = Math.min(batch.quantity, remaining);
                await tx.stockBatch.update({
                  where: { id: batch.id },
                  data: { quantity: { decrement: take } },
                });
                if (!primaryBatchId) primaryBatchId = batch.id;
                remaining -= take;
              }
              batchId = primaryBatchId;

              const unitType = VALID_UNITS.includes(item.unitType)
                ? (item.unitType as UnitType)
                : product.unitType;
              const unitPrice = Number(item.unitPrice);
              const costPrice = Number(item.costPrice ?? product.costPrice);

              normalizedItems.push({
                productId: product.id,
                productName: item.productName || product.name,
                batchId,
                quantity,
                unitType,
                unitPrice,
                costPrice,
                lineTotal: unitPrice * quantity,
                lineProfit: (unitPrice - costPrice) * quantity,
              });
              continue;
            }

            // Fallback: any in-stock batch (legacy / warehouse spillover)
            const batch = await tx.stockBatch.findFirst({
              where: {
                productId: product.id,
                quantity: { gte: quantity },
              },
              orderBy: { expiryDate: "asc" },
            });
            batchId = batch?.id ?? null;
          }

          if (!batchId) {
            throw new Error(`المخزون غير كافٍ لـ ${product.name}`);
          }

          await tx.stockBatch.update({
            where: { id: batchId },
            data: { quantity: { decrement: quantity } },
          });

          const unitType = VALID_UNITS.includes(item.unitType)
            ? (item.unitType as UnitType)
            : product.unitType;

          const unitPrice = Number(item.unitPrice);
          const costPrice = Number(item.costPrice ?? product.costPrice);

          normalizedItems.push({
            productId: product.id,
            productName: item.productName || product.name,
            batchId,
            quantity,
            unitType,
            unitPrice,
            costPrice,
            lineTotal: unitPrice * quantity,
            lineProfit: (unitPrice - costPrice) * quantity,
          });
        }

        const created = await tx.sale.create({
          data: {
            receiptNumber: generateReceiptNumber(),
            pharmacyId,
            cashierId,
            paymentMethod: paymentMethod as PaymentMethod,
            bankAppName: paymentMethod === "BANK_APP" ? bankAppName || null : null,
            transactionRef:
              paymentMethod === "BANK_APP" ? transactionRef || null : null,
            subtotal,
            total: subtotal,
            totalCost,
            profit,
            isOffline,
            syncedAt: isOffline ? null : new Date(),
            clientId: clientId || null,
            createdAt: createdAt ? new Date(createdAt) : undefined,
            items: { create: normalizedItems },
          },
          include: { items: true },
        });

        await tx.payment.create({
          data: {
            type: "SALE",
            amount: subtotal,
            method: paymentMethod as PaymentMethod,
            bankName: paymentMethod === "BANK_APP" ? bankAppName || null : null,
            transactionRef:
              paymentMethod === "BANK_APP" ? transactionRef || null : null,
            saleId: created.id,
          },
        });

        return created;
      });

      return NextResponse.json({ mode: "database", sale }, { status: 201 });
    } catch (dbError) {
      console.error("[POST /api/sales] database error:", dbError);
      const message =
        dbError instanceof Error ? dbError.message : "فشل إنشاء البيع";
      const unreachable =
        message.includes("Can't reach database") ||
        message.includes("P1001") ||
        message.includes("P1000");

      if (!unreachable) {
        return NextResponse.json({ error: message }, { status: 400 });
      }

      const receiptNumber = generateReceiptNumber();
      for (const item of items) {
        decrementDemoStock(item.productId, item.quantity);
      }
      const sale = {
        id: clientId || `sale-${Date.now()}`,
        receiptNumber,
        total: subtotal,
        profit,
        paymentMethod,
        bankAppName,
        createdAt: createdAt || new Date().toISOString(),
        itemsCount: items.length,
      };
      addDemoSale(sale);
      return NextResponse.json({ mode: "demo", sale }, { status: 201 });
    }
  } catch (error) {
    console.error("[POST /api/sales] unexpected error:", error);
    const message = error instanceof Error ? error.message : "فشل إنشاء البيع";
    return NextResponse.json({ error: message }, { status: 500 });
  }
}

export async function DELETE(request: Request) {
  const gate = await requireAdministratorForDelete();
  if (!gate.ok) return gate.response;

  try {
    const { searchParams } = new URL(request.url);
    const id = searchParams.get("id")?.trim();
    if (!id) {
      return NextResponse.json({ error: "معرف عملية البيع مطلوب" }, { status: 400 });
    }

    await prisma.$transaction(async (tx) => {
      await tx.payment.deleteMany({ where: { saleId: id } });
      await tx.sale.delete({ where: { id } });
    });

    return NextResponse.json({ ok: true, deletedId: id });
  } catch (error) {
    console.error("[DELETE /api/sales] error:", error);
    const message = error instanceof Error ? error.message : "فشل حذف عملية البيع";
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
