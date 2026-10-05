import type { Dataset } from "./data";
import { getDb } from "./db";

/** Data-quality warnings shown across the dashboard. Missing data is surfaced, never hidden. */
export interface Warning { level: "error" | "warn" | "info"; title: string; detail: string }

export function dataWarnings(ds: Dataset, now: Date = new Date()): Warning[] {
  const out: Warning[] = [];
  const last = ds.runs.find((r) => r.mode !== "legacy-import");
  if (last?.status === "error") {
    out.push({ level: "error", title: "The last sync failed", detail: `${last.error ?? "Unknown error"} Numbers shown are from the last successful sync${ds.lastSync ? ` (${ds.lastSync.slice(0, 16).replace("T", " ")} UTC)` : ""}.` });
  }
  if (ds.lastSync) {
    const hours = (now.getTime() - Date.parse(ds.lastSync)) / 3600000;
    if (hours > 36) out.push({ level: "warn", title: "Data may be stale", detail: `The last successful sync was ${Math.floor(hours / 24)} day(s) ago. Run "npm run sync" to refresh.` });
  } else if (!ds.empty) {
    out.push({ level: "warn", title: "No successful API sync yet", detail: "Only imported legacy data is available." });
  }
  const o = ds.originals;
  const noImp = o.filter((p) => p.impressions === null).length;
  if (noImp) out.push({ level: "warn", title: "Incomplete statistics", detail: `${noImp} post(s) have no impression count from the API. They are excluded from reach and rate calculations.` });
  const noPrivate = o.filter((p) => p.profile_visits === null).length;
  if (noPrivate) out.push({ level: "info", title: "Private metrics missing for older posts", detail: `${noPrivate} of ${o.length} posts have no profile visits, link clicks or X-reported engagements: X only returns them for roughly the last 30 days and they were never collected earlier. They show as "—", not 0.` });
  const unavailable = ds.capabilities.filter((c) => c.status === "not_offered").map((c) => c.label.toLowerCase());
  if (unavailable.length) out.push({ level: "info", title: "Metrics the X API does not provide", detail: `${unavailable.join(", ")}.` });

  const snap = getDb().prepare(
    `SELECT COUNT(*) AS posts, SUM(CASE WHEN c < 2 THEN 1 ELSE 0 END) AS single FROM (
       SELECT p.id, COUNT(s.id) AS c FROM posts p LEFT JOIN metric_snapshots s ON s.post_id = p.id WHERE p.kind IN ('post','quote') GROUP BY p.id)`
  ).get() as { posts: number; single: number | null };
  if (snap.posts && (snap.single ?? 0) > 0) {
    out.push({ level: "info", title: "Limited history", detail: `${snap.single} of ${snap.posts} posts have a single snapshot, so no growth curve yet. Curves build up as syncs repeat; early-hours data for older posts was never collected and cannot be recovered.` });
  }
  const ruleTagged = o.filter((p) => p.class_source === "rule" || p.class_source === null).length;
  if (ruleTagged) out.push({ level: "info", title: "Automatic tags in use", detail: `${ruleTagged} of ${o.length} posts carry rule-based (keyword) tags that have not been reviewed. Topic / hook breakdowns are only as good as the tags - edit them on any post page.` });
  if (o.length < 20) out.push({ level: "warn", title: "Small sample", detail: `Only ${o.length} original posts are stored. Medians and percentiles are unstable at this size.` });
  return out;
}
