import { Prisma } from "@prisma/client";
import { prisma } from "@/lib/prisma";
import { getSessionUser } from "@/lib/auth";

export const VALID_UNIT_TYPES = [
  "BOX",
  "CARTON",
  "BOTTLE",
  "INJECTABLE",
  "VIAL",
  "ML",
  "STRIP",
  "CATHETER",
  "DRIP",
] as const;

type UnitType = (typeof VALID_UNIT_TYPES)[number];

export type WarehouseItemUpdate = {
  batchId?: string | null;
  productId?: string | null;
  quantity?: unknown;
  expiryDate?: unknown;
  batchNumber?: unknown;
  costPrice?: unknown;
  defaultPrice?: unknown;
  sellingPrice?: unknown;
  category?: unknown;
  unitType?: unknown;
  unit?: unknown;
};

type Result = { status: number; body: Record<string, unknown> };

const isBlank = (v: unknown) => v === undefined || v === null || v === "";

function isConnectionError(error: unknown) {
  if (error instanceof Prisma.PrismaClientInitializationError) return true;
  if (error instanceof Prisma.PrismaClientKnownRequestError) {
    return ["P1001", "P1002", "P1017", "P2024", "P2028"].includes(error.code);
  }
  return /Can't reach database|Transaction already closed|timed out/i.test(
    error instanceof Error ? error.message : ""
  );
}

async function resolveWarehouseId(preferred?: string | null): Promise<string | null> {
  const session = await getSessionUser();
  for (const candidate of [preferred, session?.warehouseId]) {
    if (!candidate) continue;
    const exists = await prisma.warehouse.findUnique({
      where: { id: candidate },
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

/**
 * Update a warehouse row: batch fields (quantity, expiry, batch number, cost)
 * and product fields (category, unit, selling price) in one transaction.
 * Creates a warehouse batch when the product has none yet.
 */
export async function updateWarehouseItem(input: WarehouseItemUpdate): Promise<Result> {
  const session = await getSessionUser();
  if (!session || (session.role !== "ADMIN" && session.role !== "ADMINISTRATOR")) {
    return {
      status: 403,
      body: { error: "غير مصرح — التعديل متاح لمدير المستودع فقط" },
    };
  }

  const batchId = typeof input.batchId === "string" ? input.batchId.trim() : "";
  let productId = typeof input.productId === "string" ? input.productId.trim() : "";

  let quantity: number | undefined;
  if (!isBlank(input.quantity)) {
    quantity = Number.parseInt(String(input.quantity), 10);
    if (!Number.isInteger(quantity) || quantity < 0 || String(input.quantity).includes(".")) {
      return { status: 400, body: { error: "الكمية يجب أن تكون رقماً صحيحاً غير سالب" } };
    }
  }

  const parsePrice = (value: unknown, label: string): number | undefined | Result => {
    if (isBlank(value)) return undefined;
    const n = Number.parseFloat(String(value));
    if (!Number.isFinite(n) || n < 0) {
      return { status: 400, body: { error: `${label} غير صالح` } };
    }
    return Math.round(n * 100) / 100;
  };
  const costPrice = parsePrice(input.costPrice, "سعر التكلفة");
  if (typeof costPrice === "object") return costPrice;
  const defaultPrice = parsePrice(input.sellingPrice ?? input.defaultPrice, "سعر البيع");
  if (typeof defaultPrice === "object") return defaultPrice;

  let expiryDate: Date | undefined;
  if (!isBlank(input.expiryDate)) {
    const raw = String(input.expiryDate);
    expiryDate = new Date(/^\d{4}-\d{2}-\d{2}$/.test(raw) ? `${raw}T00:00:00.000Z` : raw);
    if (Number.isNaN(expiryDate.getTime())) {
      return { status: 400, body: { error: "تاريخ الصلاحية غير صالح" } };
    }
  }

  const batchNumber = isBlank(input.batchNumber) ? undefined : String(input.batchNumber).trim();

  const categoryRaw = isBlank(input.category) ? undefined : String(input.category);
  if (categoryRaw && categoryRaw !== "HUMAN" && categoryRaw !== "VETERINARY") {
    return { status: 400, body: { error: "التصنيف غير صالح" } };
  }
  const category = categoryRaw as "HUMAN" | "VETERINARY" | undefined;

  const unitRaw = input.unitType ?? input.unit;
  const unitType = isBlank(unitRaw) ? undefined : String(unitRaw).toUpperCase();
  if (unitType && !VALID_UNIT_TYPES.includes(unitType as UnitType)) {
    return { status: 400, body: { error: "وحدة التغليف غير صالحة" } };
  }

  const run = async (): Promise<Result> => {
    if (batchId) {
      const existing = await prisma.stockBatch.findUnique({
        where: { id: batchId },
        select: { productId: true },
      });
      if (!existing) {
        return { status: 404, body: { error: "الدفعة غير موجودة — حدّث الصفحة وحاول مجدداً" } };
      }
      productId = existing.productId;
    }
    if (!productId) {
      return { status: 400, body: { error: "معرف المنتج أو الدفعة مطلوب" } };
    }

    const current = await prisma.product.findUnique({
      where: { id: productId },
      select: { id: true, warehouseId: true },
    });
    if (!current) {
      return { status: 404, body: { error: "المنتج غير موجود — حدّث الصفحة وحاول مجدداً" } };
    }
    const warehouseId = batchId ? null : await resolveWarehouseId(current.warehouseId);

    const { product, batch } = await prisma.$transaction(
      async (tx) => {
        const product = await tx.product.update({
          where: { id: productId },
          data: {
            ...(category ? { category } : {}),
            ...(unitType ? { unitType: unitType as UnitType } : {}),
            ...(defaultPrice !== undefined ? { defaultPrice } : {}),
            ...(costPrice !== undefined ? { costPrice } : {}),
          },
        });

        const batch = batchId
          ? await tx.stockBatch.update({
              where: { id: batchId },
              data: {
                ...(quantity !== undefined ? { quantity } : {}),
                ...(costPrice !== undefined ? { costPrice } : {}),
                ...(expiryDate ? { expiryDate } : {}),
                ...(batchNumber ? { batchNumber } : {}),
              },
            })
          : await tx.stockBatch.create({
              data: {
                productId,
                batchNumber: batchNumber || `WH-${Date.now().toString(36).toUpperCase()}`,
                quantity: quantity ?? 0,
                costPrice: costPrice ?? product.costPrice,
                expiryDate: expiryDate ?? new Date(Date.now() + 365 * 86400000),
                warehouseId,
                pharmacyId: null,
                manufacturer: product.manufacturer,
                country: product.country,
              },
            });

        return { product, batch };
      },
      { maxWait: 10_000, timeout: 20_000 }
    );

    return {
      status: 200,
      body: {
        ok: true,
        product: {
          id: product.id,
          category: product.category,
          unitType: product.unitType,
          defaultPrice: Number(product.defaultPrice),
          costPrice: Number(product.costPrice),
        },
        batch: {
          id: batch.id,
          batchNumber: batch.batchNumber,
          quantity: batch.quantity,
          costPrice: Number(batch.costPrice),
          expiryDate: batch.expiryDate.toISOString(),
        },
      },
    };
  };

  try {
    return await run();
  } catch (error) {
    // Neon may be waking from auto-suspend; one retry covers the cold start.
    if (isConnectionError(error)) {
      try {
        return await run();
      } catch (retryError) {
        console.error("[warehouse update] retry failed", retryError);
        return {
          status: 503,
          body: { error: "تعذر الاتصال بقاعدة البيانات — حاول مرة أخرى بعد لحظات" },
        };
      }
    }
    console.error("[warehouse update]", error);
    if (error instanceof Prisma.PrismaClientKnownRequestError && error.code === "P2025") {
      return { status: 404, body: { error: "السجل غير موجود — حدّث الصفحة وحاول مجدداً" } };
    }
    return {
      status: 500,
      body: { error: error instanceof Error ? error.message : "فشل حفظ التعديلات" },
    };
  }
}
