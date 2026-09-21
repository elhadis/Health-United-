import { NextRequest, NextResponse } from "next/server";
import {
  AUTH_COOKIE,
  ROLE_COOKIE,
  canAccessPath,
  roleHome,
  verifySessionToken,
  type Role,
} from "@/lib/auth-session";

const PUBLIC_PATHS = [
  "/login",
  "/manifest.webmanifest",
  "/sw.js",
  "/icon.svg",
  "/logo.png",
];

function isPublic(pathname: string): boolean {
  if (PUBLIC_PATHS.some((p) => pathname === p || pathname.startsWith(`${p}/`))) {
    return true;
  }
  if (pathname.startsWith("/icons/")) return true;
  if (pathname.startsWith("/api/auth/login")) return true;
  if (pathname.startsWith("/api/auth/logout")) return true;
  if (pathname.startsWith("/api/auth/me")) return true;
  if (pathname.startsWith("/api/sync")) return true;
  return false;
}

export async function middleware(request: NextRequest) {
  const { pathname } = request.nextUrl;

  if (
    pathname.startsWith("/_next") ||
    pathname.startsWith("/favicon")
  ) {
    return NextResponse.next();
  }

  const token = request.cookies.get(AUTH_COOKIE)?.value;
  const session = await verifySessionToken(token);
  const role = (session?.role ||
    request.cookies.get(ROLE_COOKIE)?.value) as Role | undefined;

  if (isPublic(pathname)) {
    if (session && pathname.startsWith("/login")) {
      return NextResponse.redirect(new URL(roleHome(session.role), request.url));
    }
    return NextResponse.next();
  }

  if (!session || !role) {
    if (pathname.startsWith("/api/")) {
      return NextResponse.json({ error: "غير مصرح" }, { status: 401 });
    }
    const loginUrl = new URL("/login", request.url);
    loginUrl.searchParams.set("next", pathname);
    return NextResponse.redirect(loginUrl);
  }

  if (!canAccessPath(role, pathname)) {
    if (pathname.startsWith("/api/")) {
      return NextResponse.json({ error: "ليس لديك صلاحية" }, { status: 403 });
    }
    const dest = role === "USER" ? "/pos" : roleHome(role);
    return NextResponse.redirect(new URL(dest, request.url));
  }

  const response = NextResponse.next();
  response.headers.set("x-user-role", role);
  response.headers.set("x-user-id", session.id);
  return response;
}

export const config = {
  matcher: ["/((?!_next/static|_next/image|favicon.ico).*)"],
};
