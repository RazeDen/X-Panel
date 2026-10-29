import { NextResponse } from "next/server";
import { resetSeries, saveSeries, setHidden } from "@/lib/classify/store";
import { postProcess } from "@/lib/x/sync";
import { requestAccountKey } from "@/lib/request-account";
import { enterAccount } from "@/lib/accounts";

export const dynamic = "force-dynamic";

/** Save the post's format (series) by hand, or hide / restore the post ({ hidden: true | false }). */
export async function PATCH(req: Request, ctx: { params: Promise<{ id: string }> }) {
  enterAccount(await requestAccountKey());
  const id = Number((await ctx.params).id);
  if (!Number.isInteger(id)) return NextResponse.json({ error: "Invalid post id" }, { status: 400 });
  let body: Record<string, unknown>;
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: "Invalid JSON" }, { status: 400 });
  }
  if (typeof body.hidden === "boolean") {
    if (!setHidden(id, body.hidden)) return NextResponse.json({ error: "Post not found" }, { status: 404 });
    return NextResponse.json({ ok: true });
  }
  const series = typeof body.series === "string" ? body.series.slice(0, 80) : null;
  if (!saveSeries(id, series)) return NextResponse.json({ error: "Post not found" }, { status: 404 });
  return NextResponse.json({ ok: true });
}

/** Drop the manual format and hand the post back to automatic detection. */
export async function DELETE(_req: Request, ctx: { params: Promise<{ id: string }> }) {
  enterAccount(await requestAccountKey());
  const id = Number((await ctx.params).id);
  if (!Number.isInteger(id)) return NextResponse.json({ error: "Invalid post id" }, { status: 400 });
  resetSeries(id);
  postProcess();
  return NextResponse.json({ ok: true });
}
