import { NextResponse } from "next/server";
import { resetSeries, saveSeries } from "@/lib/classify/store";
import { postProcess } from "@/lib/x/sync";

export const dynamic = "force-dynamic";

/** Save the post's format (series) by hand. */
export async function PATCH(req: Request, ctx: { params: Promise<{ id: string }> }) {
  const id = Number((await ctx.params).id);
  if (!Number.isInteger(id)) return NextResponse.json({ error: "Invalid post id" }, { status: 400 });
  let body: Record<string, unknown>;
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: "Invalid JSON" }, { status: 400 });
  }
  const series = typeof body.series === "string" ? body.series.slice(0, 80) : null;
  if (!saveSeries(id, series)) return NextResponse.json({ error: "Post not found" }, { status: 404 });
  return NextResponse.json({ ok: true });
}

/** Drop the manual format and hand the post back to automatic detection. */
export async function DELETE(_req: Request, ctx: { params: Promise<{ id: string }> }) {
  const id = Number((await ctx.params).id);
  if (!Number.isInteger(id)) return NextResponse.json({ error: "Invalid post id" }, { status: 400 });
  resetSeries(id);
  postProcess();
  return NextResponse.json({ ok: true });
}
