/**
 * npm run sync:auto - run by the "X-Panel auto sync" scheduled task every 5 minutes.
 *
 * Calls the X API only when it is useful:
 *  - a post published in the last 25 hours is within 2.5 minutes of 1 hour, 6 hours or 24 hours of age
 *    and has no snapshot near that age yet (exact first-hour / 6h / 24h capture), or
 *  - the last sync started 14 or more minutes ago (the regular 15-minute rhythm, which also finds new posts).
 * Otherwise it logs one "skip" line and exits. Each run reads only posts from the last 2 days;
 * X bills re-reads of the same post once per UTC day, so the extra runs cost nothing extra.
 */
import { loadEnv } from "../src/lib/env";

loadEnv();

async function main() {
  const { getDb } = await import("../src/lib/db");
  const { getSnapshotPoints } = await import("../src/lib/data");
  const { captureDue } = await import("../src/lib/analytics/growth");
  const { runSync } = await import("../src/lib/x/sync");
  const db = getDb();
  const now = Date.now();
  const posts = db.prepare(
    "SELECT id, created_at FROM posts WHERE created_at >= ? AND kind IN ('post','quote') AND article_title IS NULL"
  ).all(new Date(now - 25 * 3600000).toISOString()) as { id: number; created_at: string }[];
  const due = captureDue(posts, getSnapshotPoints({ postIds: posts.map((p) => p.id) }), now);
  const last = db.prepare("SELECT started_at FROM sync_runs WHERE mode != 'legacy-import' ORDER BY id DESC LIMIT 1").get() as { started_at: string } | undefined;
  const minutesSince = last ? (now - Date.parse(last.started_at)) / 60000 : Infinity;
  if (!due && minutesSince < 14) {
    console.log(`skip: nothing due, last sync ${Math.round(minutesSince)} min ago`);
    return;
  }
  console.log(due ? `capture: post #${due.postId} at ${due.minutes} min` : "regular 15-minute sync");
  const r = await runSync({ mode: "incremental", days: 2, log: (m) => console.log(`  ${m}`) });
  console.log(`done: ${r.fetched} fetched, ${r.inserted} new, ${r.snapshots} snapshots, ${r.apiRequests} API requests`);
}

main().catch((err) => {
  console.error(`auto sync failed: ${err instanceof Error ? err.message : String(err)}`);
  process.exit(1);
});
