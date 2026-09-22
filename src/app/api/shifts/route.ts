import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { getSessionUser } from "@/lib/auth";

export const dynamic = "force-dynamic";

function mapShift(shift: {
  id: string;
  cashierId: string;
  cashierName: string;
  pharmacyId: string | null;
  status: string;
  startedAt: Date;
  endedAt: Date | null;
  totalSales: { toString(): string } | number;
  totalCash: { toString(): string } | number;
  totalBank: { toString(): string } | number;
  salesCount: number;
  cashier?: { id: string; name: string; username: string } | null;
  pharmacy?: { id: string; name: string } | null;
}) {
  return {
    id: shift.id,
    cashierId: shift.cashierId,
    cashierName: shift.cashierName,
    pharmacyId: shift.pharmacyId,
    status: shift.status,
    startedAt: shift.startedAt.toISOString(),
    endedAt: shift.endedAt?.toISOString() ?? null,
    totalSales: Number(shift.totalSales),
    totalCash: Number(shift.totalCash),
    totalBank: Number(shift.totalBank),
    salesCount: shift.salesCount,
    cashier: shift.cashier
      ? {
          id: shift.cashier.id,
          name: shift.cashier.name,
          username: shift.cashier.username,
        }
      : null,
    pharmacy: shift.pharmacy
      ? { id: shift.pharmacy.id, name: shift.pharmacy.name }
      : null,
  };
}

async function aggregateSalesForShift(
  cashierId: string,
  startedAt: Date,
  endedAt: Date
) {
  const sales = await prisma.sale.findMany({
    where: {
      cashierId,
      createdAt: { gte: startedAt, lte: endedAt },
    },
    select: { total: true, paymentMethod: true },
  });

  let totalSales = 0;
  let totalCash = 0;
  let totalBank = 0;
  for (const sale of sales) {
    const amount = Number(sale.total);
    totalSales += amount;
    if (sale.paymentMethod === "CASH") totalCash += amount;
    else totalBank += amount;
  }

  return {
    totalSales,
    totalCash,
    totalBank,
    salesCount: sales.length,
  };
}

export async function GET(request: Request) {
  const session = await getSessionUser();
  if (!session) {
    return NextResponse.json({ error: "غير مصرح" }, { status: 401 });
  }

  const { searchParams } = new URL(request.url);
  const current = searchParams.get("current") === "1";
  const from = searchParams.get("from");
  const to = searchParams.get("to");
  const cashierId = searchParams.get("cashierId");

  try {
    if (current) {
      const openShift = await prisma.cashierShift.findFirst({
        where: {
          cashierId: session.id,
          status: "OPEN",
        },
        include: {
          cashier: { select: { id: true, name: true, username: true } },
          pharmacy: { select: { id: true, name: true } },
        },
        orderBy: { startedAt: "desc" },
      });

      if (!openShift) {
        return NextResponse.json({ mode: "database", shift: null });
      }

      const live = await aggregateSalesForShift(
        openShift.cashierId,
        openShift.startedAt,
        new Date()
      );

      return NextResponse.json({
        mode: "database",
        shift: {
          ...mapShift(openShift),
          ...live,
        },
      });
    }

    // List / analytics — ADMINISTRATOR only
    if (session.role !== "ADMINISTRATOR") {
      return NextResponse.json(
        { error: "عذراً، هذا الإجراء متاح فقط للمدير العام" },
        { status: 403 }
      );
    }

    const shifts = await prisma.cashierShift.findMany({
      where: {
        ...(cashierId ? { cashierId } : {}),
        ...(from || to
          ? {
              startedAt: {
                ...(from ? { gte: new Date(from) } : {}),
                ...(to ? { lte: new Date(to) } : {}),
              },
            }
          : {}),
      },
      include: {
        cashier: { select: { id: true, name: true, username: true } },
        pharmacy: { select: { id: true, name: true } },
      },
      orderBy: { startedAt: "desc" },
      take: 300,
    });

    const mapped = shifts.map(mapShift);
    const summary = {
      shiftCount: mapped.length,
      totalSales: mapped.reduce((s, x) => s + x.totalSales, 0),
      totalCash: mapped.reduce((s, x) => s + x.totalCash, 0),
      totalBank: mapped.reduce((s, x) => s + x.totalBank, 0),
      openCount: mapped.filter((s) => s.status === "OPEN").length,
      closedCount: mapped.filter((s) => s.status === "CLOSED").length,
    };

    return NextResponse.json({ mode: "database", shifts: mapped, summary });
  } catch (error) {
    console.error("[GET /api/shifts]", error);
    const message = error instanceof Error ? error.message : "فشل جلب الورديات";
    return NextResponse.json({ error: message }, { status: 500 });
  }
}

export async function POST() {
  const session = await getSessionUser();
  if (!session) {
    return NextResponse.json({ error: "غير مصرح" }, { status: 401 });
  }

  try {
    const existing = await prisma.cashierShift.findFirst({
      where: { cashierId: session.id, status: "OPEN" },
    });
    if (existing) {
      return NextResponse.json(
        { error: "لديك وردية مفتوحة بالفعل", shift: mapShift(existing) },
        { status: 409 }
      );
    }

    const shift = await prisma.cashierShift.create({
      data: {
        cashierId: session.id,
        cashierName: session.name,
        pharmacyId: session.pharmacyId || null,
        status: "OPEN",
        startedAt: new Date(),
      },
      include: {
        cashier: { select: { id: true, name: true, username: true } },
        pharmacy: { select: { id: true, name: true } },
      },
    });

    return NextResponse.json(
      { mode: "database", shift: mapShift(shift) },
      { status: 201 }
    );
  } catch (error) {
    console.error("[POST /api/shifts]", error);
    const message = error instanceof Error ? error.message : "فشل فتح الوردية";
    return NextResponse.json({ error: message }, { status: 500 });
  }
}

export async function PATCH(request: Request) {
  const session = await getSessionUser();
  if (!session) {
    return NextResponse.json({ error: "غير مصرح" }, { status: 401 });
  }

  try {
    const body = await request.json().catch(() => ({}));
    const shiftId = body.id ? String(body.id) : null;

    const openShift = await prisma.cashierShift.findFirst({
      where: {
        ...(shiftId ? { id: shiftId } : {}),
        cashierId: session.id,
        status: "OPEN",
      },
      orderBy: { startedAt: "desc" },
    });

    if (!openShift) {
      return NextResponse.json(
        { error: "لا توجد وردية مفتوحة لإغلاقها" },
        { status: 404 }
      );
    }

    const endedAt = new Date();
    const totals = await aggregateSalesForShift(
      openShift.cashierId,
      openShift.startedAt,
      endedAt
    );

    const closed = await prisma.cashierShift.update({
      where: { id: openShift.id },
      data: {
        status: "CLOSED",
        endedAt,
        totalSales: totals.totalSales,
        totalCash: totals.totalCash,
        totalBank: totals.totalBank,
        salesCount: totals.salesCount,
      },
      include: {
        cashier: { select: { id: true, name: true, username: true } },
        pharmacy: { select: { id: true, name: true } },
      },
    });

    return NextResponse.json({ mode: "database", shift: mapShift(closed) });
  } catch (error) {
    console.error("[PATCH /api/shifts]", error);
    const message = error instanceof Error ? error.message : "فشل إغلاق الوردية";
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
