"use client";
import { useRouter } from "next/navigation";
import { useState } from "react";

export function SyncButton() {
  const router = useRouter();
  const [busy, setBusy] = useState<null | "incremental" | "full">(null);
  const [result, setResult] = useState<{ ok: boolean; text: string } | null>(null);
  async function run(mode: "incremental" | "full") {
    setBusy(mode);
    setResult(null);
    try {
      const res = await fetch("/api/sync", { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ mode }) });
      const j = await res.json();
      if (!res.ok) throw new Error(j.error || "Sync failed");
      setResult({ ok: true, text: `Synced ${j.fetched} posts: ${j.inserted} new, ${j.updated} updated, ${j.snapshots} snapshots saved.` });
      router.refresh();
    } catch (e) {
      setResult({ ok: false, text: `${e instanceof Error ? e.message : "Sync failed"} Existing data was not changed.` });
      router.refresh();
    } finally {
      setBusy(null);
    }
  }
  return (
    <div className="flex flex-wrap items-center gap-2">
      <button type="button" className="btn btn-primary" disabled={!!busy} onClick={() => run("incremental")}>{busy === "incremental" ? "Syncing…" : "Sync now"}</button>
      <button type="button" className="btn" disabled={!!busy} onClick={() => run("full")} title="Re-reads the whole timeline. Uses more API credits.">{busy === "full" ? "Syncing…" : "Full re-sync"}</button>
      {result && <span role="status" className={`text-xs ${result.ok ? "text-good" : "text-bad"}`}>{result.ok ? "✓ " : "✖ "}{result.text}</span>}
    </div>
  );
}
