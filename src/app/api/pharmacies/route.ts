import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { getSessionUser } from "@/lib/auth";

export const dynamic = "force-dynamic";

export async function GET() {
  const session = await getSessionUser();
  if (!session) {
    return NextResponse.json({ error: "غير مصرح" }, { status: 401 });
  }

  if (session.role !== "ADMINISTRATOR" && session.role !== "ADMIN") {
    return NextResponse.json({ error: "ليس لديك صلاحية" }, { status: 403 });
  }

  const pharmacies = await prisma.pharmacy.findMany({
    orderBy: { name: "asc" },
    select: { id: true, name: true, location: true },
  });

  const warehouses = await prisma.warehouse.findMany({
    orderBy: { name: "asc" },
    select: { id: true, name: true, location: true },
  });

  return NextResponse.json({ pharmacies, warehouses });
}
