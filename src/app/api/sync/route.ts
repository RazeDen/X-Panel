import { NextResponse } from "next/server";
import { runSync } from "@/lib/x/sync";
import { XApiError } from "@/lib/x/client";

export const dynamic = "force-dynamic";
let running = false;

/** Runs a sync from the dashboard. Credentials stay on the server; only counts are returned. */
export async function POST(req: Request) {
  if (running) return NextResponse.json({ error: "A sync is already running." }, { status: 409 });
  running = true;
  try {
    const body = (await req.json().catch(() => ({}))) as { mode?: string };
    const r = await runSync({ mode: body.mode === "full" ? "full" : "incremental" });
    return NextResponse.json({ ok: true, mode: r.mode, fetched: r.fetched, inserted: r.inserted, updated: r.updated, snapshots: r.snapshots, warnings: r.warnings });
  } catch (err) {
    const kind = err instanceof XApiError ? err.kind : "error";
    return NextResponse.json({ error: err instanceof Error ? err.message : "Sync failed", kind }, { status: 502 });
  } finally {
    running = false;
  }
}
