import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { demoBatches, demoProducts } from "@/lib/demo-data";
import { requireAdministratorForDelete } from "@/lib/auth";

export const dynamic = "force-dynamic";

export async function GET(request: Request) {
  const { searchParams } = new URL(request.url);
  const q = searchParams.get("q")?.trim() ?? "";
  const category = searchParams.get("category");
  const location = searchParams.get("location"); // pharmacy | warehouse | all

  try {
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
            ...(location === "pharmacy" ? { pharmacyId: { not: null } } : {}),
            ...(location === "warehouse" ? { warehouseId: { not: null } } : {}),
          },
          orderBy: { expiryDate: "asc" },
        },
      },
      orderBy: { name: "asc" },
      take: 100,
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
          warehouseId: body.warehouseId,
          batches: body.batch
            ? {
                create: {
                  batchNumber: body.batch.batchNumber,
                  quantity: body.batch.quantity,
                  costPrice: body.batch.costPrice ?? body.costPrice,
                  expiryDate: new Date(body.batch.expiryDate),
                  warehouseId: body.warehouseId,
                  pharmacyId: body.pharmacyId,
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
    const id = searchParams.get("id")?.trim();
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
