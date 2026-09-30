import bcrypt from "bcryptjs";
import { cookies } from "next/headers";
import { NextResponse } from "next/server";
import {
  AUTH_COOKIE,
  verifySessionToken,
  type SessionUser,
} from "@/lib/auth-session";
import { prisma } from "@/lib/prisma";

export {
  AUTH_COOKIE,
  BLOCKED_ACCOUNT_MESSAGE,
  ROLE_COOKIE,
  createSessionToken,
  verifySessionToken,
  roleHome,
  canAccessPath,
  type SessionUser,
} from "@/lib/auth-session";

export async function hashPassword(password: string): Promise<string> {
  return bcrypt.hash(password, 12);
}

export async function verifyPassword(
  password: string,
  passwordHash: string
): Promise<boolean> {
  return bcrypt.compare(password, passwordHash);
}

/** True when the account is blocked; a DB outage never locks users out. */
export async function isUserBlocked(userId: string): Promise<boolean> {
  try {
    const row = await prisma.user.findUnique({
      where: { id: userId },
      select: { isBlocked: true },
    });
    return !!row?.isBlocked;
  } catch {
    return false;
  }
}

export async function getSessionUser(): Promise<SessionUser | null> {
  const jar = await cookies();
  const session = await verifySessionToken(jar.get(AUTH_COOKIE)?.value);
  if (!session) return null;
  if (await isUserBlocked(session.id)) return null;
  return session;
}

/** Super-admin gate for destructive DELETE operations. */
export async function requireAdministratorForDelete(): Promise<
  | { ok: true; user: SessionUser }
  | { ok: false; response: NextResponse }
> {
  const user = await getSessionUser();
  if (!user || user.role !== "ADMINISTRATOR") {
    return {
      ok: false,
      response: NextResponse.json(
        {
          error: "عذراً، هذا الإجراء متاح فقط للمدير العام",
        },
        { status: 403 }
      ),
    };
  }
  return { ok: true, user };
}

/** Super-admin gate for supplier payments / official PDF features. */
export async function requireAdministrator(): Promise<
  | { ok: true; user: SessionUser }
  | { ok: false; response: NextResponse }
> {
  return requireAdministratorForDelete();
}
