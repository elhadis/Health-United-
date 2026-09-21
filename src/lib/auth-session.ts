export type Role = "ADMINISTRATOR" | "ADMIN" | "USER";

export const AUTH_COOKIE = "pharmacy_session";
export const ROLE_COOKIE = "userRole";

export type SessionUser = {
  id: string;
  name: string;
  username: string;
  role: Role;
  pharmacyId?: string | null;
  warehouseId?: string | null;
};

const SESSION_SECRET =
  process.env.AUTH_SECRET || "smart-pharmacy-dev-secret-change-me";

function bytesToBase64Url(bytes: Uint8Array): string {
  let binary = "";
  for (let i = 0; i < bytes.length; i++) binary += String.fromCharCode(bytes[i]);
  return btoa(binary).replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/g, "");
}

function base64UrlToBytes(input: string): Uint8Array {
  const padded = input.replace(/-/g, "+").replace(/_/g, "/");
  const pad = padded.length % 4 === 0 ? "" : "=".repeat(4 - (padded.length % 4));
  const binary = atob(padded + pad);
  const bytes = new Uint8Array(binary.length);
  for (let i = 0; i < binary.length; i++) bytes[i] = binary.charCodeAt(i);
  return bytes;
}

function textToBase64Url(text: string): string {
  return bytesToBase64Url(new TextEncoder().encode(text));
}

function base64UrlToText(input: string): string {
  return new TextDecoder().decode(base64UrlToBytes(input));
}

async function signPayload(payload: string, secret = SESSION_SECRET): Promise<string> {
  const key = await crypto.subtle.importKey(
    "raw",
    new TextEncoder().encode(secret),
    { name: "HMAC", hash: "SHA-256" },
    false,
    ["sign"]
  );
  const sig = await crypto.subtle.sign(
    "HMAC",
    key,
    new TextEncoder().encode(payload)
  );
  return bytesToBase64Url(new Uint8Array(sig));
}

export async function createSessionToken(user: SessionUser): Promise<string> {
  const body = textToBase64Url(
    JSON.stringify({
      ...user,
      exp: Date.now() + 1000 * 60 * 60 * 24 * 7,
    })
  );
  const sig = await signPayload(body);
  return `${body}.${sig}`;
}

export async function verifySessionToken(
  token: string | undefined | null
): Promise<SessionUser | null> {
  if (!token || !token.includes(".")) return null;
  const [body, sig] = token.split(".");
  if (!body || !sig) return null;

  const expected = await signPayload(body);
  if (expected !== sig) return null;

  try {
    const data = JSON.parse(base64UrlToText(body)) as SessionUser & { exp?: number };
    if (data.exp && Date.now() > data.exp) return null;
    if (!data.id || !data.role || !data.username) return null;
    return {
      id: data.id,
      name: data.name,
      username: data.username,
      role: data.role,
      pharmacyId: data.pharmacyId ?? null,
      warehouseId: data.warehouseId ?? null,
    };
  } catch {
    return null;
  }
}

export function roleHome(role: Role): string {
  if (role === "USER") return "/pos";
  if (role === "ADMIN") return "/warehouse";
  return "/";
}

export function canAccessPath(role: Role, pathname: string): boolean {
  if (pathname.startsWith("/login")) return true;

  if (pathname.startsWith("/reports") || pathname.startsWith("/api/analytics")) {
    return role === "ADMINISTRATOR";
  }

  if (pathname.startsWith("/warehouse")) {
    return role === "ADMINISTRATOR" || role === "ADMIN";
  }

  if (pathname.startsWith("/users") || pathname.startsWith("/api/users")) {
    return role === "ADMINISTRATOR";
  }

  if (pathname.startsWith("/api/pharmacies")) {
    return role === "ADMINISTRATOR" || role === "ADMIN";
  }

  return true;
}
