import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import {
  addDemoSale,
  decrementDemoStock,
  DEMO_PHARMACY_ID,
} from "@/lib/demo-data";
import { generateReceiptNumber } from "@/lib/utils";

export const dynamic = "force-dynamic";

type SyncSalePayload = {
  sale: {
    clientId: string;
    pharmacyId: string;
    cashierId?: string;
    paymentMethod: "CASH" | "BANK_APP";
    bankAppName?: string;
    transactionRef?: string;
    subtotal: number;
    total: number;
    totalCost: number;
    profit: number;
    items: Array<{
      productId: string;
      productName: string;
      batchId?: string;
      quantity: number;
      unitType: string;
      unitPrice: number;
      costPrice: number;
      lineTotal: number;
      lineProfit: number;
    }>;
    createdAt: string;
  };
};

async function tryPrismaSync(payload: SyncSalePayload["sale"]) {
  const existing = await prisma.sale.findUnique({
    where: { clientId: payload.clientId },
  });
  if (existing) {
    return { alreadySynced: true, saleId: existing.id };
  }

  const sale = await prisma.$transaction(async (tx) => {
    const created = await tx.sale.create({
      data: {
        receiptNumber: generateReceiptNumber(),
        pharmacyId: payload.pharmacyId,
        cashierId: payload.cashierId,
        paymentMethod: payload.paymentMethod,
        bankAppName: payload.bankAppName,
        transactionRef: payload.transactionRef,
        subtotal: payload.subtotal,
        total: payload.total,
        totalCost: payload.totalCost,
        profit: payload.profit,
        isOffline: true,
        syncedAt: new Date(),
        clientId: payload.clientId,
        createdAt: new Date(payload.createdAt),
        items: {
          create: payload.items.map((item) => ({
            productId: item.productId,
            batchId: item.batchId,
            productName: item.productName,
            quantity: item.quantity,
            unitType: item.unitType as "STRIP" | "BOX" | "BOTTLE" | "VIAL" | "ML" | "INJECTABLE" | "CARTON",
            unitPrice: item.unitPrice,
            costPrice: item.costPrice,
            lineTotal: item.lineTotal,
            lineProfit: item.lineProfit,
          })),
        },
      },
    });

    for (const item of payload.items) {
      if (item.batchId) {
        await tx.stockBatch.update({
          where: { id: item.batchId },
          data: { quantity: { decrement: item.quantity } },
        });
      }
    }

    return created;
  });

  return { alreadySynced: false, saleId: sale.id };
}

export async function POST(request: Request) {
  try {
    const body = (await request.json()) as SyncSalePayload;
    if (!body?.sale?.clientId || !body.sale.items?.length) {
      return NextResponse.json({ error: "بيانات المزامنة غير مكتملة" }, { status: 400 });
    }

    try {
      const result = await tryPrismaSync(body.sale);
      return NextResponse.json({ ok: true, mode: "database", ...result });
    } catch {
      // Demo fallback when Neon/Prisma is unavailable
      addDemoSale({
        id: body.sale.clientId,
        receiptNumber: generateReceiptNumber(),
        total: body.sale.total,
        profit: body.sale.profit,
        paymentMethod: body.sale.paymentMethod,
        bankAppName: body.sale.bankAppName,
        createdAt: body.sale.createdAt,
        itemsCount: body.sale.items.length,
      });
      for (const item of body.sale.items) {
        decrementDemoStock(item.productId, item.quantity);
      }
      return NextResponse.json({
        ok: true,
        mode: "demo",
        saleId: body.sale.clientId,
        pharmacyId: body.sale.pharmacyId || DEMO_PHARMACY_ID,
      });
    }
  } catch (error) {
    const message = error instanceof Error ? error.message : "فشل المزامنة";
    return NextResponse.json({ error: message }, { status: 500 });
  }
}

export async function GET() {
  return NextResponse.json({
    status: "ready",
    message: "Sync endpoint online",
  });
}
