import { NextResponse } from "next/server";
import { syncAccount } from "@/lib/x/run";
import { XApiError } from "@/lib/x/client";
import { requestAccountKey } from "@/lib/request-account";
import { enterAccount } from "@/lib/accounts";

export const dynamic = "force-dynamic";
let running = false;

/** Runs a sync from the dashboard. Credentials stay on the server; only counts are returned. */
export async function POST(req: Request) {
  enterAccount(await requestAccountKey());
  if (running) return NextResponse.json({ error: "A sync is already running." }, { status: 409 });
  running = true;
  try {
    const body = (await req.json().catch(() => ({}))) as { mode?: string };
    const r = await syncAccount({ mode: body.mode === "full" ? "full" : "incremental" });
    return NextResponse.json({ ok: true, mode: r.mode, fetched: r.fetched, inserted: r.inserted, updated: r.updated, snapshots: r.snapshots, warnings: r.warnings });
  } catch (err) {
    const kind = err instanceof XApiError ? err.kind : "error";
    return NextResponse.json({ error: err instanceof Error ? err.message : "Sync failed", kind }, { status: 502 });
  } finally {
    running = false;
  }
}
