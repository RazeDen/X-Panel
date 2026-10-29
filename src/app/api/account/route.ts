import { NextResponse } from "next/server";
import { findAccount } from "@/lib/accounts";
import { ACCOUNT_COOKIE } from "@/lib/request-account";

export const dynamic = "force-dynamic";

/** Switch the dashboard to another account: { key } (remembered in a cookie for a year). */
export async function POST(req: Request) {
  const body = (await req.json().catch(() => null)) as { key?: unknown } | null;
  const acc = findAccount(typeof body?.key === "string" ? body.key : null);
  if (!acc) return NextResponse.json({ error: "Unknown account" }, { status: 400 });
  const res = NextResponse.json({ ok: true, key: acc.key });
  res.cookies.set(ACCOUNT_COOKIE, acc.key, { path: "/", sameSite: "lax", maxAge: 365 * 86400 });
  return res;
}
