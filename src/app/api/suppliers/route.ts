import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { requireAdministrator } from "@/lib/auth";

export const dynamic = "force-dynamic";

export async function GET() {
  const gate = await requireAdministrator();
  if (!gate.ok) return gate.response;

  try {
    const suppliers = await prisma.supplier.findMany({
      orderBy: { name: "asc" },
      take: 200,
    });
    return NextResponse.json({ mode: "database", suppliers });
  } catch (error) {
    const message =
      error instanceof Error ? error.message : "فشل جلب الموردين";
    return NextResponse.json({ error: message }, { status: 500 });
  }
}

export async function POST(request: Request) {
  const gate = await requireAdministrator();
  if (!gate.ok) return gate.response;

  try {
    const body = await request.json();
    const name = String(body.name || "").trim();
    if (!name) {
      return NextResponse.json({ error: "اسم المورد مطلوب" }, { status: 400 });
    }

    const supplier = await prisma.supplier.create({
      data: {
        name,
        country: body.country ? String(body.country).trim() : null,
        phone: body.phone ? String(body.phone).trim() : null,
        email: body.email ? String(body.email).trim() : null,
        address: body.address ? String(body.address).trim() : null,
      },
    });

    return NextResponse.json({ mode: "database", supplier }, { status: 201 });
  } catch (error) {
    const message =
      error instanceof Error ? error.message : "فشل إنشاء المورد";
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
