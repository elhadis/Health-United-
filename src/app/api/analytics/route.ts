import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { getAnalyticsSummary } from "@/lib/demo-data";

export const dynamic = "force-dynamic";

export async function GET(request: Request) {
  const { searchParams } = new URL(request.url);
  const range = searchParams.get("range") ?? "weekly";
  const fromParam = searchParams.get("from");
  const toParam = searchParams.get("to");

  const now = new Date();
  let from = new Date(now);
  if (range === "daily") from.setHours(0, 0, 0, 0);
  else if (range === "weekly") from.setDate(from.getDate() - 7);
  else if (range === "monthly") from.setMonth(from.getMonth() - 1);
  else if (range === "custom" && fromParam) from = new Date(fromParam);

  const to = toParam ? new Date(toParam) : now;

  try {
    const sales = await prisma.sale.findMany({
      where: { createdAt: { gte: from, lte: to } },
      include: { items: true },
      orderBy: { createdAt: "asc" },
    });

    const totalSales = sales.reduce((s, x) => s + Number(x.total), 0);
    const totalProfit = sales.reduce((s, x) => s + Number(x.profit), 0);
    const cashTotal = sales
      .filter((s) => s.paymentMethod === "CASH")
      .reduce((s, x) => s + Number(x.total), 0);
    const bankTotal = sales
      .filter((s) => s.paymentMethod === "BANK_APP")
      .reduce((s, x) => s + Number(x.total), 0);

    const productMap = new Map<
      string,
      { name: string; quantity: number; revenue: number; profit: number }
    >();
    for (const sale of sales) {
      for (const item of sale.items) {
        const prev = productMap.get(item.productId) ?? {
          name: item.productName,
          quantity: 0,
          revenue: 0,
          profit: 0,
        };
        prev.quantity += item.quantity;
        prev.revenue += Number(item.lineTotal);
        prev.profit += Number(item.lineProfit);
        productMap.set(item.productId, prev);
      }
    }

    const topSelling = [...productMap.values()]
      .sort((a, b) => b.quantity - a.quantity)
      .slice(0, 5);

    const lowStockBatches = await prisma.stockBatch.findMany({
      where: { quantity: { lte: 10 } },
      include: { product: true },
      take: 20,
    });

    const nearExpiryDate = new Date();
    nearExpiryDate.setDate(nearExpiryDate.getDate() + 90);
    const nearExpiryBatches = await prisma.stockBatch.findMany({
      where: {
        expiryDate: { lte: nearExpiryDate },
        quantity: { gt: 0 },
      },
      include: { product: true },
      orderBy: { expiryDate: "asc" },
      take: 20,
    });

    const dayMs = 24 * 60 * 60 * 1000;
    const days = Math.min(31, Math.ceil((to.getTime() - from.getTime()) / dayMs) || 7);
    const daily = Array.from({ length: days }).map((_, i) => {
      const date = new Date(from.getTime() + i * dayMs);
      const key = date.toISOString().slice(0, 10);
      const daySales = sales.filter(
        (s) => s.createdAt.toISOString().slice(0, 10) === key
      );
      return {
        date: key,
        label: date.toLocaleDateString("ar-SD", { weekday: "short", day: "numeric" }),
        sales: daySales.reduce((sum, s) => sum + Number(s.total), 0),
        profit: daySales.reduce((sum, s) => sum + Number(s.profit), 0),
      };
    });

    return NextResponse.json({
      mode: "database",
      summary: {
        totalSales,
        totalProfit,
        salesCount: sales.length,
        cashTotal,
        bankTotal,
        lowStockCount: lowStockBatches.length,
        nearExpiryCount: nearExpiryBatches.length,
        topSelling,
        daily,
        lowStock: lowStockBatches.map((b) => ({
          id: b.productId,
          batchId: b.id,
          batchNumber: b.batchNumber,
          name: b.product.name,
          availableQty: b.quantity,
          lowStockThreshold: b.product.lowStockThreshold,
          expiryDate: b.expiryDate.toISOString(),
          category: b.product.category,
        })),
        nearExpiry: nearExpiryBatches.map((b) => ({
          id: b.productId,
          batchId: b.id,
          batchNumber: b.batchNumber,
          name: b.product.name,
          availableQty: b.quantity,
          expiryDate: b.expiryDate.toISOString(),
          category: b.product.category,
        })),
      },
    });
  } catch {
    return NextResponse.json({ mode: "demo", summary: getAnalyticsSummary() });
  }
}
