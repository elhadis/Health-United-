import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { demoBatches, demoProducts } from "@/lib/demo-data";
import { getSessionUser, requireAdministratorForDelete } from "@/lib/auth";

export const dynamic = "force-dynamic";

async function resolveDefaultWarehouseId(
  requested?: string | null
): Promise<string | null> {
  if (requested) {
    const exists = await prisma.warehouse.findUnique({
      where: { id: requested },
      select: { id: true },
    });
    if (exists) return exists.id;
  }

  const session = await getSessionUser();
  if (session?.warehouseId) {
    const exists = await prisma.warehouse.findUnique({
      where: { id: session.warehouseId },
      select: { id: true },
    });
    if (exists) return exists.id;
  }

  const first = await prisma.warehouse.findFirst({
    orderBy: { createdAt: "asc" },
    select: { id: true },
  });
  return first?.id ?? null;
}
async function resolvePharmacyId(requested?: string | null): Promise<string | null> {
  const session = await getSessionUser();
  for (const candidate of [requested, session?.pharmacyId]) {
    if (!candidate) continue;
    const exists = await prisma.pharmacy.findUnique({
      where: { id: candidate },
      select: { id: true },
    });
    if (exists) return exists.id;
  }
  const first = await prisma.pharmacy.findFirst({
    orderBy: { createdAt: "asc" },
    select: { id: true },
  });
  return first?.id ?? null;
}

function toStockUnits(
  qty: number,
  orderUnit: string,
  productUnit: string,
  unitsPerBox: number
): number {
  const n = Math.max(0, Math.floor(Number(qty) || 0));
  const factor = Math.max(1, Math.floor(Number(unitsPerBox) || 1));
  const orderIsBox = orderUnit === "BOX" || orderUnit === "CARTON";
  const productIsBox = productUnit === "BOX" || productUnit === "CARTON";
  if (orderIsBox && !productIsBox) return n * factor;
  if (!orderIsBox && productIsBox && orderUnit !== productUnit) {
    return Math.ceil(n / factor);
  }
  return n;
}

/**
 * Confirmed transfers ("مؤكد من الصيدلية") that never produced pharmacy stock
 * (e.g. confirmed before stock crediting existed) get a batch equal to
 * confirmed received − sold, so the cashier can sell the remaining balance.
 * Only products with no pharmacy batch at all are touched, so this is idempotent.
 */
async function backfillConfirmedPharmacyStock(pharmacyId: string) {
  const confirmedItems = await prisma.orderItem.findMany({
    where: { order: { pharmacyId, status: "CONFIRMED" } },
    select: {
      productId: true,
      quantity: true,
      unitType: true,
      product: {
        select: {
          unitType: true,
          unitsPerBox: true,
          costPrice: true,
          manufacturer: true,
          country: true,
        },
      },
    },
  });
  if (confirmedItems.length === 0) return;

  const productIds = Array.from(new Set(confirmedItems.map((i) => i.productId)));
  const existing = await prisma.stockBatch.findMany({
    where: { pharmacyId, productId: { in: productIds } },
    select: { productId: true },
    distinct: ["productId"],
  });
  const hasBatch = new Set(existing.map((b) => b.productId));
  const missing = productIds.filter((id) => !hasBatch.has(id));
  if (missing.length === 0) return;

  const sold = await prisma.saleItem.groupBy({
    by: ["productId"],
    where: { productId: { in: missing }, sale: { pharmacyId } },
    _sum: { quantity: true },
  });
  const soldMap = new Map(sold.map((s) => [s.productId, s._sum.quantity ?? 0]));

  for (const productId of missing) {
    const items = confirmedItems.filter((i) => i.productId === productId);
    const product = items[0]?.product;
    if (!product) continue;
    const received = items.reduce(
      (sum, i) =>
        sum + toStockUnits(i.quantity, i.unitType, product.unitType, product.unitsPerBox),
      0
    );
    const remaining = received - (soldMap.get(productId) ?? 0);
    if (remaining <= 0) continue;

    await prisma.stockBatch.create({
      data: {
        productId,
        batchNumber: `RCV-${Date.now().toString(36).toUpperCase()}`,
        quantity: remaining,
        costPrice: product.costPrice,
        expiryDate: new Date(Date.now() + 365 * 86400000),
        pharmacyId,
        warehouseId: null,
        manufacturer: product.manufacturer,
        country: product.country,
      },
    });
  }
}

export async function GET(request: Request) {
  const { searchParams } = new URL(request.url);
  const q = searchParams.get("q")?.trim() ?? "";
  const category = searchParams.get("category");
  const location = searchParams.get("location"); // pharmacy | warehouse | all
  let pharmacyId = searchParams.get("pharmacyId");

  try {
    if (location === "pharmacy") {
      pharmacyId = await resolvePharmacyId(pharmacyId);
      if (pharmacyId) {
        try {
          await backfillConfirmedPharmacyStock(pharmacyId);
        } catch (err) {
          console.error("[GET /api/products] backfill failed", err);
        }
      }
    }

    const products = await prisma.product.findMany({
      where: {
        ...(q
          ? {
              OR: [
                { name: { contains: q, mode: "insensitive" } },
                { sku: { contains: q, mode: "insensitive" } },
                { manufacturer: { contains: q, mode: "insensitive" } },
              ],
            }
          : {}),
        ...(category ? { category: category as "HUMAN" | "VETERINARY" } : {}),
      },
      include: {
        batches: {
          where: {
            quantity: { gt: 0 },
            ...(location === "pharmacy"
              ? pharmacyId
                ? { pharmacyId }
                : { pharmacyId: { not: null } }
              : {}),
            ...(location === "warehouse" ? { warehouseId: { not: null } } : {}),
          },
          orderBy: { expiryDate: "asc" },
        },
      },
      orderBy: { name: "asc" },
    });

    const mapped = products.map((p) => {
      const availableQty = p.batches.reduce((s, b) => s + b.quantity, 0);
      const nearest = p.batches[0];
      return {
        id: p.id,
        name: p.name,
        sku: p.sku,
        category: p.category,
        unitType: p.unitType,
        unitsPerBox: p.unitsPerBox,
        defaultPrice: Number(p.defaultPrice),
        costPrice: Number(p.costPrice),
        manufacturer: p.manufacturer,
        country: p.country,
        lowStockThreshold: p.lowStockThreshold,
        availableQty,
        batchId: nearest?.id,
        batchNumber: nearest?.batchNumber,
        expiryDate: nearest?.expiryDate?.toISOString(),
        batches: p.batches.map((b) => ({
          id: b.id,
          batchNumber: b.batchNumber,
          quantity: b.quantity,
          costPrice: Number(b.costPrice),
          expiryDate: b.expiryDate.toISOString(),
          warehouseId: b.warehouseId,
          pharmacyId: b.pharmacyId,
        })),
      };
    });

    return NextResponse.json({ mode: "database", products: mapped });
  } catch {
    let products = [...demoProducts];
    if (q) {
      const lower = q.toLowerCase();
      products = products.filter(
        (p) =>
          p.name.toLowerCase().includes(lower) ||
          p.sku.toLowerCase().includes(lower) ||
          p.manufacturer.toLowerCase().includes(lower)
      );
    }
    if (category) {
      products = products.filter((p) => p.category === category);
    }
    if (location === "warehouse") {
      products = products.filter((p) =>
        demoBatches.some((b) => b.productId === p.id && b.location === "WAREHOUSE")
      );
    }
    if (location === "pharmacy") {
      products = products.filter((p) =>
        demoBatches.some((b) => b.productId === p.id && b.location === "PHARMACY")
      );
    }
    return NextResponse.json({ mode: "demo", products, batches: demoBatches });
  }
}

export async function POST(request: Request) {
  try {
    const body = await request.json();
    try {
      const warehouseId = await resolveDefaultWarehouseId(body.warehouseId);

      const product = await prisma.product.create({
        data: {
          name: body.name,
          sku: body.sku,
          category: body.category,
          unitType: body.unitType,
          unitsPerBox: body.unitsPerBox ?? 1,
          defaultPrice: body.defaultPrice,
          costPrice: body.costPrice,
          manufacturer: body.manufacturer,
          country: body.country,
          lowStockThreshold: body.lowStockThreshold ?? 10,
          warehouseId,
          batches: body.batch
            ? {
                create: {
                  batchNumber: body.batch.batchNumber,
                  quantity: body.batch.quantity,
                  costPrice: body.batch.costPrice ?? body.costPrice,
                  expiryDate: new Date(body.batch.expiryDate),
                  warehouseId,
                  pharmacyId: body.pharmacyId ?? null,
                  manufacturer: body.manufacturer,
                  country: body.country,
                },
              }
            : undefined,
        },
        include: { batches: true },
      });
      return NextResponse.json({ mode: "database", product }, { status: 201 });
    } catch {
      return NextResponse.json(
        {
          mode: "demo",
          product: { id: `prod-${Date.now()}`, ...body },
          message: "تم الحفظ محلياً (وضع العرض) — اربط Neon لحفظ دائم",
        },
        { status: 201 }
      );
    }
  } catch (error) {
    const message = error instanceof Error ? error.message : "فشل إنشاء المنتج";
    return NextResponse.json({ error: message }, { status: 500 });
  }
}

export async function DELETE(request: Request) {
  const gate = await requireAdministratorForDelete();
  if (!gate.ok) return gate.response;

  try {
    const { searchParams } = new URL(request.url);
    const batchId = searchParams.get("batchId")?.trim();
    const id = searchParams.get("id")?.trim();

    if (batchId) {
      const batch = await prisma.stockBatch.findUnique({
        where: { id: batchId },
        select: { id: true, productId: true },
      });
      if (!batch) {
        return NextResponse.json({ error: "الدفعة غير موجودة" }, { status: 404 });
      }

      const productDeleted = await prisma.$transaction(async (tx) => {
        // Keep sales history intact while removing the batch itself.
        await tx.saleItem.updateMany({
          where: { batchId },
          data: { batchId: null },
        });
        await tx.stockBatch.delete({ where: { id: batchId } });

        const [inStock, saleCount, orderCount] = await Promise.all([
          tx.stockBatch.count({
            where: { productId: batch.productId, quantity: { gt: 0 } },
          }),
          tx.saleItem.count({ where: { productId: batch.productId } }),
          tx.orderItem.count({ where: { productId: batch.productId } }),
        ]);
        if (inStock === 0 && saleCount === 0 && orderCount === 0) {
          await tx.product.delete({ where: { id: batch.productId } });
          return true;
        }
        return false;
      });

      return NextResponse.json({
        ok: true,
        deletedBatchId: batchId,
        productDeleted,
      });
    }

    if (!id) {
      return NextResponse.json({ error: "معرف المنتج مطلوب" }, { status: 400 });
    }

    const [saleCount, orderCount] = await Promise.all([
      prisma.saleItem.count({ where: { productId: id } }),
      prisma.orderItem.count({ where: { productId: id } }),
    ]);

    if (saleCount > 0 || orderCount > 0) {
      return NextResponse.json(
        {
          error:
            "لا يمكن حذف المنتج لارتباطه بسجلات مبيعات أو طلبات. احذف السجلات المرتبطة أولاً.",
        },
        { status: 409 }
      );
    }

    await prisma.product.delete({ where: { id } });
    return NextResponse.json({ ok: true, deletedId: id });
  } catch (error) {
    const message = error instanceof Error ? error.message : "فشل حذف المنتج";
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
