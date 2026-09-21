import { NextResponse } from "next/server";
import type { Role } from "@prisma/client";
import { prisma } from "@/lib/prisma";
import { getSessionUser, hashPassword, requireAdministratorForDelete } from "@/lib/auth";

export const dynamic = "force-dynamic";

const VALID_ROLES: Role[] = ["ADMINISTRATOR", "ADMIN", "USER"];

export async function GET() {
  const session = await getSessionUser();
  if (!session || session.role !== "ADMINISTRATOR") {
    return NextResponse.json({ error: "ليس لديك صلاحية" }, { status: 403 });
  }

  const users = await prisma.user.findMany({
    select: {
      id: true,
      name: true,
      username: true,
      email: true,
      role: true,
      pharmacyId: true,
      warehouseId: true,
      createdAt: true,
      pharmacy: { select: { id: true, name: true } },
      warehouse: { select: { id: true, name: true } },
    },
    orderBy: { createdAt: "desc" },
  });

  return NextResponse.json({ users });
}

export async function POST(request: Request) {
  try {
    const session = await getSessionUser();
    if (!session || session.role !== "ADMINISTRATOR") {
      return NextResponse.json(
        { error: "فقط المسؤول يمكنه إنشاء المستخدمين" },
        { status: 403 }
      );
    }

    const body = await request.json();
    const name = String(body.name || "").trim();
    const username = String(body.username || "").trim().toLowerCase();
    const password = String(body.password || "");
    const role = String(body.role || "USER") as Role;
    const pharmacyId = body.pharmacyId ? String(body.pharmacyId) : null;
    const warehouseId = body.warehouseId ? String(body.warehouseId) : null;
    const email = body.email
      ? String(body.email).trim().toLowerCase()
      : `${username}@pharmacy.local`;

    if (!name || !username || !password) {
      return NextResponse.json(
        { error: "الاسم واسم المستخدم وكلمة المرور مطلوبة" },
        { status: 400 }
      );
    }

    if (password.length < 8) {
      return NextResponse.json(
        { error: "كلمة المرور يجب أن تكون 8 أحرف على الأقل" },
        { status: 400 }
      );
    }

    if (!VALID_ROLES.includes(role)) {
      return NextResponse.json({ error: "دور غير صالح" }, { status: 400 });
    }

    if (role === "USER" && !pharmacyId) {
      return NextResponse.json(
        { error: "يجب ربط مستخدم الصيدلية بصيدلية" },
        { status: 400 }
      );
    }

    const existing = await prisma.user.findUnique({ where: { username } });
    if (existing) {
      return NextResponse.json(
        { error: "اسم المستخدم مستخدم مسبقاً" },
        { status: 409 }
      );
    }

    const passwordHash = await hashPassword(password);

    const user = await prisma.user.create({
      data: {
        name,
        username,
        email,
        passwordHash,
        role,
        pharmacyId,
        warehouseId,
      },
      select: {
        id: true,
        name: true,
        username: true,
        email: true,
        role: true,
        pharmacyId: true,
        warehouseId: true,
        createdAt: true,
        pharmacy: { select: { id: true, name: true } },
        warehouse: { select: { id: true, name: true } },
      },
    });

    return NextResponse.json({ user }, { status: 201 });
  } catch (error) {
    const message = error instanceof Error ? error.message : "فشل إنشاء المستخدم";
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
      return NextResponse.json({ error: "معرف المستخدم مطلوب" }, { status: 400 });
    }

    if (id === gate.user.id) {
      return NextResponse.json(
        { error: "لا يمكنك حذف حسابك الحالي" },
        { status: 400 }
      );
    }

    const target = await prisma.user.findUnique({
      where: { id },
      select: { id: true, role: true },
    });
    if (!target) {
      return NextResponse.json({ error: "المستخدم غير موجود" }, { status: 404 });
    }

    if (target.role === "ADMINISTRATOR") {
      const adminCount = await prisma.user.count({
        where: { role: "ADMINISTRATOR" },
      });
      if (adminCount <= 1) {
        return NextResponse.json(
          { error: "لا يمكن حذف آخر مدير عام في النظام" },
          { status: 400 }
        );
      }
    }

    await prisma.user.delete({ where: { id } });
    return NextResponse.json({ ok: true, deletedId: id });
  } catch (error) {
    const message = error instanceof Error ? error.message : "فشل حذف المستخدم";
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
