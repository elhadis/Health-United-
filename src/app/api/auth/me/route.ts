import { NextResponse } from "next/server";
import { cookies } from "next/headers";
import {
  AUTH_COOKIE,
  BLOCKED_ACCOUNT_MESSAGE,
  ROLE_COOKIE,
  isUserBlocked,
  verifySessionToken,
} from "@/lib/auth";

export const dynamic = "force-dynamic";

export async function GET() {
  const jar = await cookies();
  const user = await verifySessionToken(jar.get(AUTH_COOKIE)?.value);
  if (!user) {
    return NextResponse.json({ error: "غير مسجل الدخول" }, { status: 401 });
  }
  if (await isUserBlocked(user.id)) {
    const response = NextResponse.json(
      { error: BLOCKED_ACCOUNT_MESSAGE, blocked: true },
      { status: 403 }
    );
    response.cookies.set(AUTH_COOKIE, "", { httpOnly: true, path: "/", maxAge: 0 });
    response.cookies.set(ROLE_COOKIE, "", { path: "/", maxAge: 0 });
    return response;
  }
  return NextResponse.json({ user });
}
