import bcrypt from "bcryptjs";
import { cookies } from "next/headers";
import { NextResponse } from "next/server";
import {
  AUTH_COOKIE,
  createSessionToken,
  verifySessionToken,
  type SessionUser,
} from "@/lib/auth-session";

export {
  AUTH_COOKIE,
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

export async function getSessionUser(): Promise<SessionUser | null> {
  const jar = await cookies();
  return verifySessionToken(jar.get(AUTH_COOKIE)?.value);
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
