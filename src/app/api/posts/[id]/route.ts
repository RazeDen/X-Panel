import { NextResponse } from "next/server";
import { resetClassification, saveClassification } from "@/lib/classify/store";
import { postProcess } from "@/lib/x/sync";

export const dynamic = "force-dynamic";
const text = (v: unknown) => (typeof v === "string" ? v.slice(0, 80) : v === null ? null : undefined);

/** Save manual tags for one post. */
export async function PATCH(req: Request, ctx: { params: Promise<{ id: string }> }) {
  const id = Number((await ctx.params).id);
  if (!Number.isInteger(id)) return NextResponse.json({ error: "Invalid post id" }, { status: 400 });
  let body: Record<string, unknown>;
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: "Invalid JSON" }, { status: 400 });
  }
  const ok = saveClassification(id, {
    topic: text(body.topic), subtopic: text(body.subtopic), content_type: text(body.content_type), hook_type: text(body.hook_type),
    is_news: typeof body.is_news === "boolean" ? body.is_news : body.is_news === null ? null : undefined,
    format: text(body.format),
    series: text(body.series),
  }, "manual");
  if (!ok) return NextResponse.json({ error: "Post not found" }, { status: 404 });
  return NextResponse.json({ ok: true });
}

/** Drop manual tags and hand the post back to automatic (rule-based) tagging. */
export async function DELETE(_req: Request, ctx: { params: Promise<{ id: string }> }) {
  const id = Number((await ctx.params).id);
  if (!Number.isInteger(id)) return NextResponse.json({ error: "Invalid post id" }, { status: 400 });
  resetClassification(id);
  postProcess();
  return NextResponse.json({ ok: true });
}
