import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { requireAdministratorForDelete } from "@/lib/auth";

export const dynamic = "force-dynamic";

/** Permanently delete a supplier payment (ADMINISTRATOR only). */
export async function DELETE(
  _request: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  const gate = await requireAdministratorForDelete();
  if (!gate.ok) return gate.response;

  try {
    const { id } = await params;
    const paymentId = decodeURIComponent(id ?? "").trim();
    if (!paymentId) {
      return NextResponse.json({ error: "معرف الدفعة مطلوب" }, { status: 400 });
    }

    const existing = await prisma.payment.findUnique({
      where: { id: paymentId },
      select: { id: true, invoiceId: true },
    });
    if (!existing) {
      return NextResponse.json({ error: "الدفعة غير موجودة" }, { status: 404 });
    }

    await prisma.payment.delete({ where: { id: paymentId } });

    let invoice: { id: string; totalAmount: number; paid: number; remaining: number } | null =
      null;
    if (existing.invoiceId) {
      const inv = await prisma.supplierInvoice.findUnique({
        where: { id: existing.invoiceId },
        select: { id: true, totalAmount: true, payments: { select: { amount: true } } },
      });
      if (inv) {
        const total = Number(inv.totalAmount);
        const paid = inv.payments.reduce((s, p) => s + Number(p.amount), 0);
        invoice = { id: inv.id, totalAmount: total, paid, remaining: Math.max(0, total - paid) };
      }
    }

    return NextResponse.json({ ok: true, deletedId: paymentId, invoice });
  } catch (error) {
    console.error("[DELETE /api/payments/[id]]", error);
    const message = error instanceof Error ? error.message : "فشل حذف الدفعة";
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
