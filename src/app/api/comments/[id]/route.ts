import { NextResponse } from "next/server";
import { setCommentHidden } from "@/lib/comments/data";
import { requestAccountKey } from "@/lib/request-account";
import { enterAccount } from "@/lib/accounts";

export const dynamic = "force-dynamic";

/** Hide a comment (spam) or bring it back: { hidden: true | false }. Nothing is deleted. */
export async function PATCH(req: Request, ctx: { params: Promise<{ id: string }> }) {
  enterAccount(await requestAccountKey());
  const id = (await ctx.params).id;
  if (!/^\d+$/.test(id)) return NextResponse.json({ error: "Invalid comment id" }, { status: 400 });
  const body = (await req.json().catch(() => null)) as { hidden?: unknown } | null;
  if (typeof body?.hidden !== "boolean") return NextResponse.json({ error: "Expected { hidden: boolean }" }, { status: 400 });
  if (!setCommentHidden(id, body.hidden)) return NextResponse.json({ error: "Comment not found" }, { status: 404 });
  return NextResponse.json({ ok: true });
}
