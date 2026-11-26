import { cookies } from "next/headers";
import { createHmac, timingSafeEqual } from "crypto";

const COOKIE = "de_admin";

function signature(): string {
  return createHmac("sha256", process.env.SESSION_SECRET ?? "")
    .update("admin:" + (process.env.ADMIN_PASSWORD ?? ""))
    .digest("hex");
}

function same(a: string, b: string): boolean {
  const x = Buffer.from(a);
  const y = Buffer.from(b);
  return x.length === y.length && timingSafeEqual(x, y);
}

export function configured(): boolean {
  return Boolean(process.env.ADMIN_PASSWORD && process.env.SESSION_SECRET);
}

export function passwordOk(input: string): boolean {
  return configured() && same(input, process.env.ADMIN_PASSWORD as string);
}

export async function isAdmin(): Promise<boolean> {
  if (!configured()) return false;
  const value = (await cookies()).get(COOKIE)?.value;
  return Boolean(value && same(value, signature()));
}

export async function requireAdmin(): Promise<void> {
  if (!(await isAdmin())) throw new Error("Not signed in");
}

export async function signIn(): Promise<void> {
  (await cookies()).set(COOKIE, signature(), {
    httpOnly: true,
    secure: process.env.NODE_ENV === "production",
    sameSite: "lax",
    path: "/",
    maxAge: 60 * 60 * 24 * 14,
  });
}

export async function signOut(): Promise<void> {
  (await cookies()).delete(COOKIE);
}
