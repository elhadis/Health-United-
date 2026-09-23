import { NextResponse } from "next/server";
import type { UnitType, Prisma } from "@prisma/client";
import { prisma } from "@/lib/prisma";
import {
  addDemoOrder,
  decrementDemoStock,
  demoOrders,
  demoProducts,
  updateDemoOrderStatus,
} from "@/lib/demo-data";
import { getSessionUser, requireAdministratorForDelete } from "@/lib/auth";
import { generateOrderNumber } from "@/lib/utils";

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

function parseQuantity(value: unknown): number | null {
  const n = typeof value === "number" ? value : Number(value);
  if (!Number.isFinite(n) || n <= 0) return null;
  return Math.floor(n);
}

async function resolveBranchIds(input: {
  pharmacyId?: string | null;
  warehouseId?: string | null;
}) {
  const session = await getSessionUser();

  let pharmacyId =
    input.pharmacyId || session?.pharmacyId || null;
  let warehouseId =
    input.warehouseId || session?.warehouseId || null;

  if (pharmacyId) {
    const exists = await prisma.pharmacy.findUnique({
      where: { id: pharmacyId },
      select: { id: true },
    });
    if (!exists) pharmacyId = null;
  }

  if (warehouseId) {
    const exists = await prisma.warehouse.findUnique({
      where: { id: warehouseId },
      select: { id: true },
    });
    if (!exists) warehouseId = null;
  }

  if (!pharmacyId) {
    const firstPharmacy = await prisma.pharmacy.findFirst({
      orderBy: { createdAt: "asc" },
      select: { id: true },
    });
    pharmacyId = firstPharmacy?.id ?? null;
  }

  if (!warehouseId) {
    const firstWarehouse = await prisma.warehouse.findFirst({
      orderBy: { createdAt: "asc" },
      select: { id: true },
    });
    warehouseId = firstWarehouse?.id ?? null;
  }

  return {
    pharmacyId,
    warehouseId,
    requesterId: session?.id ?? null,
  };
}

async function resolveProductId(item: {
  productId?: string;
  productName?: string;
}): Promise<string | null> {
  // Prefer explicit productId from the form — never invent a default product
  if (item.productId) {
    const byId = await prisma.product.findUnique({
      where: { id: item.productId },
      select: { id: true },
    });
    return byId?.id ?? null;
  }

  const name = item.productName?.trim();
  if (!name) return null;

  const byName = await prisma.product.findFirst({
    where: { name: { equals: name, mode: "insensitive" } },
    select: { id: true },
  });
  return byName?.id ?? null;
}

function mapOrderForClient(order: {
  id: string;
  orderNumber: string;
  type: string;
  status: string;
  notes: string | null;
  createdAt: Date;
  approvedAt?: Date | null;
  dispatchedAt?: Date | null;
  confirmedAt?: Date | null;
  pharmacy?: { id: string; name: string } | null;
  warehouse?: { id: string; name: string } | null;
  requester?: { id: string; name: string; username?: string } | null;
  items: Array<{
    quantity: number;
    unitType: string;
    productId?: string;
    product?: { id?: string; name: string } | null;
    productName?: string;
  }>;
}) {
  return {
    id: order.id,
    orderNumber: order.orderNumber,
    type: order.type,
    status: order.status,
    notes: order.notes ?? undefined,
    createdAt: order.createdAt.toISOString?.() ?? order.createdAt,
    approvedAt: order.approvedAt
      ? order.approvedAt.toISOString?.() ?? order.approvedAt
      : null,
    dispatchedAt: order.dispatchedAt
      ? order.dispatchedAt.toISOString?.() ?? order.dispatchedAt
      : null,
    confirmedAt: order.confirmedAt
      ? order.confirmedAt.toISOString?.() ?? order.confirmedAt
      : null,
    pharmacyId: order.pharmacy?.id ?? null,
    pharmacyName: order.pharmacy?.name ?? null,
    warehouseId: order.warehouse?.id ?? null,
    warehouseName: order.warehouse?.name ?? null,
    requesterId: order.requester?.id ?? null,
    requesterName: order.requester?.name ?? null,
    items: order.items.map((item) => ({
      productId: item.productId ?? item.product?.id ?? null,
      productName: item.product?.name ?? item.productName ?? "منتج",
      quantity: item.quantity,
      unitType: item.unitType,
    })),
  };
}

/**
 * Convert ordered quantity into the unit used on warehouse batch rows.
 * Handles BOX/CARTON vs base-unit mismatches via unitsPerBox.
 */
function toWarehouseStockQuantity(
  orderQty: number,
  orderUnit: UnitType | string,
  productUnit: UnitType | string,
  unitsPerBox: number
): number {
  const qty = Math.max(0, Math.floor(Number(orderQty) || 0));
  const factor = Math.max(1, Math.floor(Number(unitsPerBox) || 1));
  const orderIsBox = orderUnit === "BOX" || orderUnit === "CARTON";
  const productIsBox = productUnit === "BOX" || productUnit === "CARTON";

  if (orderIsBox && !productIsBox) {
    return qty * factor;
  }
  if (!orderIsBox && productIsBox && orderUnit !== productUnit) {
    return Math.ceil(qty / factor);
  }
  return qty;
}

/** Active warehouse batches for a product (aggregated across valid locations). */
function warehouseBatchWhere(
  productId: string,
  warehouseId: string | null
): Prisma.StockBatchWhereInput {
  const warehouseClauses: Prisma.StockBatchWhereInput[] = [
    // Unassigned / central stock (common when products are added without an explicit warehouseId)
    { pharmacyId: null },
    // Any batch explicitly tagged to a warehouse
    { warehouseId: { not: null } },
  ];
  if (warehouseId) {
    warehouseClauses.unshift({ warehouseId });
  }

  return {
    productId,
    quantity: { gt: 0 },
    OR: warehouseClauses,
  };
}

function rankWarehouseBatch(
  batch: { warehouseId: string | null; pharmacyId: string | null },
  preferredWarehouseId: string | null
): number {
  if (preferredWarehouseId && batch.warehouseId === preferredWarehouseId) return 0;
  if (batch.warehouseId && !batch.pharmacyId) return 1;
  if (batch.warehouseId) return 2;
  if (!batch.pharmacyId) return 3;
  return 4;
}

/**
 * Transfer stock helper:
 * - mode "deduct": FEFO warehouse batch deduction (approval)
 * - mode "credit": pharmacy stock crediting (cashier confirmation)
 * - mode "both": deduct warehouse then credit pharmacy in one step
 */
async function deductWarehouseStockForOrder(
  tx: Prisma.TransactionClient,
  order: {
    warehouseId: string | null;
    pharmacyId: string | null;
    items: Array<{
      productId: string;
      quantity: number;
      unitType: UnitType | string;
      product: {
        name: string;
        unitType?: UnitType | string;
        unitsPerBox?: number;
        costPrice?: unknown;
        manufacturer?: string | null;
        country?: string | null;
      } | null;
    }>;
  },
  options: { mode?: "deduct" | "credit" | "both" } = {}
) {
  const mode = options.mode ?? "deduct";
  const doDeduct = mode === "deduct" || mode === "both";
  const doCredit = mode === "credit" || mode === "both";

  for (const item of order.items) {
    const product = await tx.product.findUnique({
      where: { id: item.productId },
      select: {
        id: true,
        name: true,
        unitType: true,
        unitsPerBox: true,
        costPrice: true,
        manufacturer: true,
        country: true,
      },
    });

    const productName = product?.name ?? item.product?.name ?? "منتج";
    const productUnit =
      product?.unitType ?? item.product?.unitType ?? item.unitType;
    const unitsPerBox =
      product?.unitsPerBox ?? item.product?.unitsPerBox ?? 1;

    const need = toWarehouseStockQuantity(
      item.quantity,
      item.unitType,
      productUnit,
      unitsPerBox
    );

    if (need <= 0) {
      throw new Error(`كمية غير صالحة للمنتج «${productName}»`);
    }

    // --- FEFO warehouse deduction ---
    if (doDeduct) {
      const batches = await tx.stockBatch.findMany({
        where: warehouseBatchWhere(item.productId, order.warehouseId),
        orderBy: { expiryDate: "asc" },
      });

      batches.sort((a, b) => {
        const rank =
          rankWarehouseBatch(a, order.warehouseId) -
          rankWarehouseBatch(b, order.warehouseId);
        if (rank !== 0) return rank;
        return a.expiryDate.getTime() - b.expiryDate.getTime();
      });

      const available = batches.reduce((sum, b) => sum + b.quantity, 0);
      if (available < need) {
        throw new Error(
          `المخزون غير كافٍ للمنتج «${productName}». المطلوب: ${need}، المتاح في المستودع: ${available}`
        );
      }

      let remaining = need;
      for (const batch of batches) {
        if (remaining <= 0) break;
        const take = Math.min(batch.quantity, remaining);

        await tx.stockBatch.update({
          where: { id: batch.id },
          data: { quantity: { decrement: take } },
        });

        // When mode is "both", move deducted qty into pharmacy immediately
        if (doCredit && order.pharmacyId) {
          await tx.stockBatch.create({
            data: {
              productId: item.productId,
              batchNumber: batch.batchNumber,
              quantity: take,
              costPrice: batch.costPrice,
              expiryDate: batch.expiryDate,
              pharmacyId: order.pharmacyId,
              warehouseId: null,
              manufacturer: batch.manufacturer,
              country: batch.country,
            },
          });
        }

        remaining -= take;
      }
    }

    // --- Pharmacy credit only (confirmation) ---
    if (doCredit && !doDeduct) {
      if (!order.pharmacyId) {
        throw new Error(
          "تعذر تأكيد الاستلام — الصيدلية غير محددة لهذا الطلب"
        );
      }

      const existingBatch = await tx.stockBatch.findFirst({
        where: {
          productId: item.productId,
          pharmacyId: order.pharmacyId,
        },
        orderBy: { expiryDate: "desc" },
      });

      if (existingBatch) {
        await tx.stockBatch.update({
          where: { id: existingBatch.id },
          data: { quantity: { increment: need } },
        });
      } else {
        await tx.stockBatch.create({
          data: {
            productId: item.productId,
            batchNumber: `RCV-${Date.now().toString(36).toUpperCase()}`,
            quantity: need,
            costPrice: Number(
              product?.costPrice ?? item.product?.costPrice ?? 0
            ),
            expiryDate: new Date(Date.now() + 365 * 86400000),
            pharmacyId: order.pharmacyId,
            warehouseId: null,
            manufacturer:
              product?.manufacturer ?? item.product?.manufacturer ?? null,
            country: product?.country ?? item.product?.country ?? null,
          },
        });
      }
    }
  }
}

export async function GET(request: Request) {
  const { searchParams } = new URL(request.url);
  const status = searchParams.get("status");
  const type = searchParams.get("type");

  try {
    const orders = await prisma.order.findMany({
      where: {
        ...(status
          ? {
              status: status as
                | "PENDING"
                | "APPROVED"
                | "DISPATCHED"
                | "CONFIRMED"
                | "REJECTED",
            }
          : {}),
        ...(type
          ? {
              type: type as
                | "PHARMACY_TO_WAREHOUSE"
                | "WAREHOUSE_TO_ADMIN"
                | "PROCUREMENT",
            }
          : {}),
      },
      include: {
        items: { include: { product: true } },
        pharmacy: true,
        warehouse: true,
        requester: true,
      },
      orderBy: { createdAt: "desc" },
      take: 500,
    });
    return NextResponse.json({
      mode: "database",
      orders: orders.map(mapOrderForClient),
    });
  } catch {
    let orders = [...demoOrders];
    if (status) orders = orders.filter((o) => o.status === status);
    if (type) orders = orders.filter((o) => o.type === type);
    return NextResponse.json({ mode: "demo", orders });
  }
}

export async function POST(request: Request) {
  try {
    const body = await request.json();
    const rawItems = Array.isArray(body.items) ? body.items : [];

    if (rawItems.length === 0) {
      return NextResponse.json(
        { error: "يجب إضافة منتج واحد على الأقل للطلب" },
        { status: 400 }
      );
    }

    const orderNumber = generateOrderNumber();

    try {
      const { pharmacyId, warehouseId, requesterId } = await resolveBranchIds({
        pharmacyId: body.pharmacyId,
        warehouseId: body.warehouseId,
      });

      if (!pharmacyId || !warehouseId) {
        return NextResponse.json(
          {
            error:
              "تعذر تحديد الصيدلية أو المستودع. تأكد من وجود فروع في قاعدة البيانات.",
          },
          { status: 400 }
        );
      }

      const resolvedItems: Array<{
        productId: string;
        quantity: number;
        unitType: UnitType;
        notes?: string;
        productName?: string;
      }> = [];

      for (const item of rawItems) {
        const quantity = parseQuantity(item.quantity);
        if (quantity == null) {
          return NextResponse.json(
            { error: "الكمية يجب أن تكون رقماً صحيحاً أكبر من صفر" },
            { status: 400 }
          );
        }

        const productId = await resolveProductId({
          productId: item.productId,
          productName: item.productName,
        });

        if (!productId) {
          return NextResponse.json(
            {
              error: `تعذر العثور على المنتج: ${item.productName || item.productId || "غير معروف"}`,
            },
            { status: 400 }
          );
        }

        const unitType = VALID_UNITS.includes(item.unitType)
          ? (item.unitType as UnitType)
          : "BOX";

        resolvedItems.push({
          productId,
          quantity,
          unitType,
          notes: item.notes,
          productName: item.productName,
        });
      }

      const order = await prisma.order.create({
        data: {
          orderNumber,
          type: body.type ?? "PHARMACY_TO_WAREHOUSE",
          status: "PENDING",
          notes: body.notes || null,
          pharmacyId,
          warehouseId,
          requesterId: body.requesterId || requesterId,
          items: {
            create: resolvedItems.map((item) => ({
              productId: item.productId,
              quantity: item.quantity,
              unitType: item.unitType,
              notes: item.notes,
            })),
          },
        },
        include: {
          items: { include: { product: true } },
          pharmacy: true,
          warehouse: true,
          requester: true,
        },
      });

      return NextResponse.json(
        { mode: "database", order: mapOrderForClient(order) },
        { status: 201 }
      );
    } catch (dbError) {
      console.error("[POST /api/orders] database error:", dbError);

      // Only fall back to in-memory demo when the database itself is unreachable
      const message =
        dbError instanceof Error ? dbError.message : "فشل إنشاء الطلب";
      const unreachable =
        message.includes("Can't reach database") ||
        message.includes("P1001") ||
        message.includes("P1000");

      if (!unreachable) {
        return NextResponse.json({ error: message }, { status: 400 });
      }

      const order = {
        id: `ord-${Date.now()}`,
        orderNumber,
        type: body.type ?? "PHARMACY_TO_WAREHOUSE",
        status: "PENDING" as const,
        notes: body.notes,
        createdAt: new Date().toISOString(),
        items: rawItems.map(
          (item: {
            productName?: string;
            quantity: number;
            unitType: string;
          }) => ({
            productName: item.productName ?? "منتج",
            quantity: parseQuantity(item.quantity) ?? 1,
            unitType: item.unitType,
          })
        ),
      };
      addDemoOrder(order);
      return NextResponse.json({ mode: "demo", order }, { status: 201 });
    }
  } catch (error) {
    console.error("[POST /api/orders] unexpected error:", error);
    const message = error instanceof Error ? error.message : "فشل إنشاء الطلب";
    return NextResponse.json({ error: message }, { status: 500 });
  }
}

export async function PATCH(request: Request) {
  try {
    const body = await request.json();
    const { id, status } = body;
    if (!id || !status) {
      return NextResponse.json(
        { error: "معرف الطلب والحالة مطلوبان" },
        { status: 400 }
      );
    }

    const session = await getSessionUser();
    const approverId = body.approverId || session?.id || null;

    const statusTimestamps: Record<string, Date> = {};
    if (status === "APPROVED") statusTimestamps.approvedAt = new Date();
    if (status === "DISPATCHED") statusTimestamps.dispatchedAt = new Date();
    if (status === "CONFIRMED") statusTimestamps.confirmedAt = new Date();

    try {
      const existing = await prisma.order.findUnique({
        where: { id },
        include: {
          items: { include: { product: true } },
          pharmacy: true,
          warehouse: true,
          requester: true,
        },
      });

      if (!existing) {
        return NextResponse.json({ error: "الطلب غير موجود" }, { status: 404 });
      }

      // Stock deduction fires only on first transition to APPROVED
      const shouldDeduct =
        status === "APPROVED" && existing.status === "PENDING";

      // Pharmacy stock increases when cashier confirms receipt
      const shouldCreditPharmacy =
        status === "CONFIRMED" && existing.status === "DISPATCHED";

      if (shouldDeduct) {
        try {
          const order = await prisma.$transaction(async (tx) => {
            await deductWarehouseStockForOrder(
              tx,
              {
                warehouseId: existing.warehouseId,
                pharmacyId: existing.pharmacyId,
                items: existing.items.map((item) => ({
                  productId: item.productId,
                  quantity: item.quantity,
                  unitType: item.unitType,
                  product: item.product,
                })),
              },
              { mode: "deduct" }
            );

            return tx.order.update({
              where: { id },
              data: {
                status: "APPROVED",
                approverId,
                ...statusTimestamps,
              },
              include: {
                items: { include: { product: true } },
                pharmacy: true,
                warehouse: true,
                requester: true,
              },
            });
          });

          return NextResponse.json({
            mode: "database",
            order: mapOrderForClient(order),
            stockDeducted: true,
          });
        } catch (stockError) {
          const message =
            stockError instanceof Error
              ? stockError.message
              : "فشل خصم المخزون";
          // Insufficient stock / validation — cancel approval
          if (message.includes("المخزون غير كافٍ")) {
            return NextResponse.json({ error: message }, { status: 400 });
          }
          throw stockError;
        }
      }

      if (shouldCreditPharmacy) {
        try {
          // Resolve destination pharmacy (order → session cashier → first pharmacy)
          let creditPharmacyId =
            existing.pharmacyId || session?.pharmacyId || null;
          if (creditPharmacyId) {
            const exists = await prisma.pharmacy.findUnique({
              where: { id: creditPharmacyId },
              select: { id: true },
            });
            if (!exists) creditPharmacyId = null;
          }
          if (!creditPharmacyId) {
            const first = await prisma.pharmacy.findFirst({
              orderBy: { createdAt: "asc" },
              select: { id: true },
            });
            creditPharmacyId = first?.id ?? null;
          }

          if (!creditPharmacyId) {
            return NextResponse.json(
              {
                error:
                  "تعذر تأكيد الاستلام — لا توجد صيدلية مرتبطة لإضافة المخزون",
              },
              { status: 400 }
            );
          }

          const order = await prisma.$transaction(async (tx) => {
            await deductWarehouseStockForOrder(
              tx,
              {
                pharmacyId: creditPharmacyId,
                warehouseId: existing.warehouseId,
                items: existing.items.map((item) => ({
                  productId: item.productId,
                  quantity: item.quantity,
                  unitType: item.unitType,
                  product: item.product,
                })),
              },
              { mode: "credit" }
            );

            return tx.order.update({
              where: { id },
              data: {
                status: "CONFIRMED",
                pharmacyId: existing.pharmacyId ?? creditPharmacyId,
                ...statusTimestamps,
              },
              include: {
                items: { include: { product: true } },
                pharmacy: true,
                warehouse: true,
                requester: true,
              },
            });
          });

          return NextResponse.json({
            mode: "database",
            order: mapOrderForClient(order),
            pharmacyStockCredited: true,
          });
        } catch (creditError) {
          const message =
            creditError instanceof Error
              ? creditError.message
              : "فشل إضافة المخزون للصيدلية";
          return NextResponse.json({ error: message }, { status: 400 });
        }
      }

      const order = await prisma.order.update({
        where: { id },
        data: {
          status,
          approverId: status === "APPROVED" ? approverId : undefined,
          ...statusTimestamps,
        },
        include: {
          items: { include: { product: true } },
          pharmacy: true,
          warehouse: true,
          requester: true,
        },
      });
      return NextResponse.json({
        mode: "database",
        order: mapOrderForClient(order),
      });
    } catch (dbError) {
      console.error("[PATCH /api/orders] database error:", dbError);
      const message =
        dbError instanceof Error ? dbError.message : "فشل تحديث الطلب";
      if (message.includes("المخزون غير كافٍ")) {
        return NextResponse.json({ error: message }, { status: 400 });
      }

      // Demo fallback: validate + deduct when approving
      if (status === "APPROVED") {
        const demoOrder = demoOrders.find((o) => o.id === id);
        if (demoOrder && demoOrder.status === "PENDING") {
          for (const item of demoOrder.items) {
            const product = demoProducts.find(
              (p) =>
                p.name === item.productName ||
                p.name.includes(item.productName) ||
                item.productName.includes(p.name)
            );
            if (!product || product.availableQty < item.quantity) {
              return NextResponse.json(
                {
                  error: `المخزون غير كافٍ للمنتج «${item.productName}». المطلوب: ${item.quantity}، المتاح في المستودع: ${product?.availableQty ?? 0}`,
                },
                { status: 400 }
              );
            }
          }
          for (const item of demoOrder.items) {
            const product = demoProducts.find((p) => p.name === item.productName);
            if (product) decrementDemoStock(product.id, item.quantity);
          }
        }
      }

      const order = updateDemoOrderStatus(id, status);
      if (!order) {
        return NextResponse.json({ error: "الطلب غير موجود" }, { status: 404 });
      }
      return NextResponse.json({ mode: "demo", order });
    }
  } catch (error) {
    console.error("[PATCH /api/orders] unexpected error:", error);
    const message = error instanceof Error ? error.message : "فشل تحديث الطلب";
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
      return NextResponse.json({ error: "معرف الطلب مطلوب" }, { status: 400 });
    }

    await prisma.order.delete({ where: { id } });
    return NextResponse.json({ ok: true, deletedId: id });
  } catch (error) {
    console.error("[DELETE /api/orders] error:", error);
    const message = error instanceof Error ? error.message : "فشل حذف الطلب";
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
