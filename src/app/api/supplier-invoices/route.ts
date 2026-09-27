import { NextResponse } from "next/server";
import type { PaymentMethod } from "@prisma/client";
import { prisma } from "@/lib/prisma";
import { requireAdministrator } from "@/lib/auth";

export const dynamic = "force-dynamic";

const VALID_METHODS: PaymentMethod[] = ["CASH", "BANK_APP"];

type PaymentRow = {
  id: string;
  amount: unknown;
  method: string;
  bankName: string | null;
  bankCountry: string | null;
  transactionRef: string | null;
  notes: string | null;
  paidAt: Date | null;
  createdAt: Date;
};

function mapPayment(p: PaymentRow) {
  return {
    id: p.id,
    amount: Number(p.amount),
    method: p.method,
    bankName: p.bankName,
    bankCountry: p.bankCountry,
    transactionRef: p.transactionRef,
    notes: p.notes,
    paidAt: (p.paidAt ?? p.createdAt).toISOString(),
    createdAt: p.createdAt.toISOString(),
  };
}

function parseDate(value: unknown): Date | null {
  if (!value) return null;
  const raw = String(value);
  const d = new Date(/^\d{4}-\d{2}-\d{2}$/.test(raw) ? `${raw}T12:00:00.000Z` : raw);
  return Number.isNaN(d.getTime()) ? null : d;
}

/**
 * Supplier invoices with their installment history.
 * Legacy supplier payments recorded before invoices existed are returned as
 * single-payment invoices (total = amount paid).
 */
export async function GET() {
  const gate = await requireAdministrator();
  if (!gate.ok) return gate.response;

  try {
    const [invoices, unlinked] = await Promise.all([
      prisma.supplierInvoice.findMany({
        include: {
          supplier: true,
          payments: { orderBy: [{ paidAt: "asc" }, { createdAt: "asc" }] },
        },
        orderBy: { invoiceDate: "desc" },
        take: 500,
      }),
      prisma.payment.findMany({
        where: { type: "SUPPLIER", invoiceId: null },
        include: { supplier: true },
        orderBy: { createdAt: "desc" },
        take: 500,
      }),
    ]);

    const rows = [
      ...invoices.map((inv) => ({
        id: inv.id,
        legacy: false,
        invoiceNumber: inv.invoiceNumber,
        description: inv.description,
        invoiceDate: inv.invoiceDate.toISOString(),
        totalAmount: Number(inv.totalAmount),
        supplier: { id: inv.supplier.id, name: inv.supplier.name, country: inv.supplier.country },
        payments: inv.payments.map(mapPayment),
      })),
      ...unlinked.map((p) => ({
        id: `legacy-${p.id}`,
        legacy: true,
        invoiceNumber: p.transactionRef,
        description: p.notes,
        invoiceDate: (p.paidAt ?? p.createdAt).toISOString(),
        totalAmount: Number(p.amount),
        supplier: p.supplier
          ? { id: p.supplier.id, name: p.supplier.name, country: p.supplier.country }
          : null,
        payments: [mapPayment(p)],
      })),
    ].sort((a, b) => new Date(b.invoiceDate).getTime() - new Date(a.invoiceDate).getTime());

    return NextResponse.json({ mode: "database", invoices: rows });
  } catch (error) {
    console.error("[GET /api/supplier-invoices]", error);
    const message = error instanceof Error ? error.message : "فشل جلب فواتير الموردين";
    return NextResponse.json({ error: message }, { status: 500 });
  }
}

export async function POST(request: Request) {
  const gate = await requireAdministrator();
  if (!gate.ok) return gate.response;

  try {
    const body = await request.json().catch(() => ({}));
    const supplierName = String(body.supplierName || "").trim();
    if (!supplierName) {
      return NextResponse.json({ error: "اسم شركة المورد مطلوب" }, { status: 400 });
    }
    const totalAmount = Number.parseFloat(String(body.totalAmount));
    if (!Number.isFinite(totalAmount) || totalAmount <= 0) {
      return NextResponse.json({ error: "إجمالي قيمة الفاتورة غير صالح" }, { status: 400 });
    }
    const invoiceDate = parseDate(body.invoiceDate) ?? new Date();

    const initialAmount = body.initialPayment?.amount
      ? Number.parseFloat(String(body.initialPayment.amount))
      : 0;
    if (!Number.isFinite(initialAmount) || initialAmount < 0) {
      return NextResponse.json({ error: "مبلغ الدفعة الأولى غير صالح" }, { status: 400 });
    }
    if (initialAmount > totalAmount + 0.001) {
      return NextResponse.json(
        { error: "الدفعة الأولى لا يمكن أن تتجاوز إجمالي الفاتورة" },
        { status: 400 }
      );
    }
    const method = (body.initialPayment?.method as PaymentMethod) || "BANK_APP";
    if (!VALID_METHODS.includes(method)) {
      return NextResponse.json({ error: "طريقة الدفع غير صالحة" }, { status: 400 });
    }
    const bankCountry = body.initialPayment?.bankCountry
      ? String(body.initialPayment.bankCountry).trim()
      : null;

    const invoice = await prisma.$transaction(
      async (tx) => {
        const existing = await tx.supplier.findFirst({
          where: { name: { equals: supplierName, mode: "insensitive" } },
        });
        const supplier =
          existing ??
          (await tx.supplier.create({ data: { name: supplierName, country: bankCountry } }));

        const created = await tx.supplierInvoice.create({
          data: {
            supplierId: supplier.id,
            invoiceNumber: body.invoiceNumber ? String(body.invoiceNumber).trim() : null,
            description: body.description ? String(body.description).trim() : null,
            totalAmount,
            invoiceDate,
          },
        });

        if (initialAmount > 0) {
          await tx.payment.create({
            data: {
              type: "SUPPLIER",
              amount: initialAmount,
              method,
              bankName: body.initialPayment?.bankName
                ? String(body.initialPayment.bankName).trim()
                : null,
              bankCountry,
              transactionRef: body.initialPayment?.transactionRef
                ? String(body.initialPayment.transactionRef).trim()
                : null,
              notes: body.initialPayment?.notes ? String(body.initialPayment.notes).trim() : null,
              supplierId: supplier.id,
              invoiceId: created.id,
              paidAt: parseDate(body.initialPayment?.paidAt) ?? invoiceDate,
            },
          });
        }
        return created;
      },
      { maxWait: 10_000, timeout: 20_000 }
    );

    return NextResponse.json({ mode: "database", invoiceId: invoice.id }, { status: 201 });
  } catch (error) {
    console.error("[POST /api/supplier-invoices]", error);
    const message = error instanceof Error ? error.message : "فشل إنشاء فاتورة المورد";
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
