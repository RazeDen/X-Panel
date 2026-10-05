"use client";
import { useRouter } from "next/navigation";
import { useState } from "react";

/** variant="topbar": compact white button in the top bar (console "Buy Credits" position); the result shows beside it. */
export function SyncButton({ variant = "full" }: { variant?: "full" | "topbar" }) {
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
  if (variant === "topbar") {
    return (
      <div className="flex items-center gap-3">
        {result && <span role="status" title={result.text} className={`hidden max-w-[280px] truncate text-[12px] xl:inline ${result.ok ? "text-good" : "text-bad"}`}>{result.ok ? "✓ " : "✖ "}{result.text}</span>}
        <button type="button" className="btn btn-primary" disabled={!!busy} onClick={() => run("incremental")}
          title="Incremental sync of the last 45 days (about $0.13 of X API reads; re-reads within the same UTC day are free).">
          <svg viewBox="0 0 16 16" className={`h-3.5 w-3.5 ${busy ? "animate-spin" : ""}`} fill="none" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" aria-hidden>
            <path d="M13.5 8A5.5 5.5 0 1 1 11.9 4.1M13.5 2.5v3h-3" />
          </svg>
          {busy ? "Syncing…" : "Sync now"}
        </button>
      </div>
    );
  }
  return (
    <div className="flex flex-wrap items-center gap-2">
      <button type="button" className="btn btn-primary" disabled={!!busy} onClick={() => run("incremental")}>{busy === "incremental" ? "Syncing…" : "Sync now"}</button>
      <button type="button" className="btn" disabled={!!busy} onClick={() => run("full")} title="Re-reads the whole timeline. Uses more API credits.">{busy === "full" ? "Syncing…" : "Full re-sync"}</button>
      {result && <span role="status" className={`text-xs ${result.ok ? "text-good" : "text-bad"}`}>{result.ok ? "✓ " : "✖ "}{result.text}</span>}
    </div>
  );
}
