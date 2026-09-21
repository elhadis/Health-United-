import { NextResponse } from "next/server";
import type { PaymentMethod, PaymentType } from "@prisma/client";
import { prisma } from "@/lib/prisma";
import { requireAdministrator } from "@/lib/auth";

export const dynamic = "force-dynamic";

const VALID_METHODS: PaymentMethod[] = ["CASH", "BANK_APP"];
const VALID_TYPES: PaymentType[] = ["SALE", "SUPPLIER", "TRANSFER"];

export async function GET(request: Request) {
  const gate = await requireAdministrator();
  if (!gate.ok) return gate.response;

  try {
    const { searchParams } = new URL(request.url);
    const type = searchParams.get("type");

    const payments = await prisma.payment.findMany({
      where: {
        ...(type && VALID_TYPES.includes(type as PaymentType)
          ? { type: type as PaymentType }
          : { type: "SUPPLIER" }),
      },
      include: { supplier: true },
      orderBy: { createdAt: "desc" },
      take: 200,
    });

    return NextResponse.json({
      mode: "database",
      payments: payments.map((p) => ({
        id: p.id,
        type: p.type,
        amount: Number(p.amount),
        method: p.method,
        bankName: p.bankName,
        bankCountry: p.bankCountry,
        transactionRef: p.transactionRef,
        notes: p.notes,
        saleId: p.saleId,
        createdAt: p.createdAt.toISOString(),
        supplier: p.supplier
          ? {
              id: p.supplier.id,
              name: p.supplier.name,
              country: p.supplier.country,
              phone: p.supplier.phone,
              email: p.supplier.email,
            }
          : null,
      })),
    });
  } catch (error) {
    const message =
      error instanceof Error ? error.message : "فشل جلب المدفوعات";
    return NextResponse.json({ error: message }, { status: 500 });
  }
}

export async function POST(request: Request) {
  const gate = await requireAdministrator();
  if (!gate.ok) return gate.response;

  try {
    const body = await request.json();
    const amount = Number(body.amount);
    if (!Number.isFinite(amount) || amount <= 0) {
      return NextResponse.json({ error: "المبلغ غير صالح" }, { status: 400 });
    }

    const method = (body.method as PaymentMethod) || "BANK_APP";
    if (!VALID_METHODS.includes(method)) {
      return NextResponse.json({ error: "طريقة الدفع غير صالحة" }, { status: 400 });
    }

    const supplierName = String(body.supplierName || body.companyName || "").trim();
    if (!supplierName) {
      return NextResponse.json({ error: "اسم شركة المورد مطلوب" }, { status: 400 });
    }

    const bankName = body.bankName ? String(body.bankName).trim() : null;
    const bankCountry = body.bankCountry
      ? String(body.bankCountry).trim()
      : body.country
        ? String(body.country).trim()
        : null;
    const transactionRef = body.transactionRef
      ? String(body.transactionRef).trim()
      : null;
    const notes = body.notes ? String(body.notes).trim() : null;

    const payment = await prisma.$transaction(async (tx) => {
      let supplierId = body.supplierId ? String(body.supplierId) : null;

      if (!supplierId) {
        const existing = await tx.supplier.findFirst({
          where: { name: { equals: supplierName, mode: "insensitive" } },
        });
        if (existing) {
          supplierId = existing.id;
          if (bankCountry && !existing.country) {
            await tx.supplier.update({
              where: { id: existing.id },
              data: { country: bankCountry },
            });
          }
        } else {
          const created = await tx.supplier.create({
            data: {
              name: supplierName,
              country: bankCountry,
            },
          });
          supplierId = created.id;
        }
      }

      return tx.payment.create({
        data: {
          type: "SUPPLIER",
          amount,
          method,
          bankName,
          bankCountry,
          transactionRef,
          notes,
          supplierId,
        },
        include: { supplier: true },
      });
    });

    return NextResponse.json(
      {
        mode: "database",
        payment: {
          id: payment.id,
          type: payment.type,
          amount: Number(payment.amount),
          method: payment.method,
          bankName: payment.bankName,
          bankCountry: payment.bankCountry,
          transactionRef: payment.transactionRef,
          notes: payment.notes,
          createdAt: payment.createdAt.toISOString(),
          supplier: payment.supplier
            ? {
                id: payment.supplier.id,
                name: payment.supplier.name,
                country: payment.supplier.country,
              }
            : null,
        },
      },
      { status: 201 }
    );
  } catch (error) {
    console.error("[POST /api/payments]", error);
    const message =
      error instanceof Error ? error.message : "فشل تسجيل الدفعة";
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
