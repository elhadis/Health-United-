import { NextResponse } from "next/server";
import { AUTH_COOKIE, ROLE_COOKIE } from "@/lib/auth";

export const dynamic = "force-dynamic";

export async function POST() {
  const response = NextResponse.json({ ok: true });
  response.cookies.set(AUTH_COOKIE, "", {
    httpOnly: true,
    path: "/",
    maxAge: 0,
  });
  response.cookies.set(ROLE_COOKIE, "", {
    path: "/",
    maxAge: 0,
  });
  return response;
}
