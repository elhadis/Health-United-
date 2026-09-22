import { NextResponse } from "next/server";
import type { UnitType } from "@prisma/client";
import { prisma } from "@/lib/prisma";
import {
  addDemoOrder,
  demoOrders,
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
  items: Array<{
    quantity: number;
    unitType: string;
    product?: { name: string } | null;
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
    items: order.items.map((item) => ({
      productName: item.product?.name ?? item.productName ?? "منتج",
      quantity: item.quantity,
      unitType: item.unitType,
    })),
  };
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
      take: 100,
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
        include: { items: { include: { product: true } } },
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
    const { id, status, approverId } = body;
    if (!id || !status) {
      return NextResponse.json(
        { error: "معرف الطلب والحالة مطلوبان" },
        { status: 400 }
      );
    }

    const statusTimestamps: Record<string, Date> = {};
    if (status === "APPROVED") statusTimestamps.approvedAt = new Date();
    if (status === "DISPATCHED") statusTimestamps.dispatchedAt = new Date();
    if (status === "CONFIRMED") statusTimestamps.confirmedAt = new Date();

    try {
      const order = await prisma.order.update({
        where: { id },
        data: {
          status,
          approverId,
          ...statusTimestamps,
        },
        include: { items: { include: { product: true } } },
      });
      return NextResponse.json({
        mode: "database",
        order: mapOrderForClient(order),
      });
    } catch (dbError) {
      console.error("[PATCH /api/orders] database error:", dbError);
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
