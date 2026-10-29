/**
 * npm run sync:auto - run by x-panel-auto-sync.timer every 5 minutes, once for every account.
 *
 * Calls the account's source (X API for main, twitterapi.io for extra accounts) only when it is useful:
 *  - a post published in the last 25 hours is within 2.5 minutes of 1 hour, 6 hours or 24 hours of age
 *    and has no snapshot near that age yet (exact first-hour / 6h / 24h capture), or
 *  - the last sync started 14 or more minutes ago (the regular 15-minute rhythm, which also finds new posts).
 * Otherwise it logs one "skip" line. Each run reads only posts from the last 2 days;
 * X bills re-reads of the same post once per UTC day, so the extra runs cost nothing extra.
 *
 * Then, when a twitterapi.io key is set, it reads new comments - only when reply counts changed or an
 * hour passed (src/lib/comments/sync.ts commentsDue). A failure for one account or for comments never
 * stops the others; the run exits non-zero when any post sync failed.
 */
import { loadEnv } from "../src/lib/env";

loadEnv();

async function main() {
  const { accounts, withAccount } = await import("../src/lib/accounts");
  const { getDb, getMeta } = await import("../src/lib/db");
  const { getSnapshotPoints } = await import("../src/lib/data");
  const { captureDue } = await import("../src/lib/analytics/growth");
  const { syncAccount } = await import("../src/lib/x/run");
  const { commentsDue, syncComments } = await import("../src/lib/comments/sync");
  const list = accounts();
  let failures = 0;
  for (const acc of list) {
    await withAccount(acc.key, async () => {
      const tag = list.length > 1 ? `[${acc.username ?? getMeta("account_username") ?? acc.key}] ` : "";
      const say = (m: string) => console.log(`${tag}${m}`);
      try {
        const db = getDb();
        const now = Date.now();
        const posts = db.prepare(
          "SELECT id, created_at FROM posts WHERE created_at >= ? AND kind IN ('post','quote') AND article_title IS NULL"
        ).all(new Date(now - 25 * 3600000).toISOString()) as { id: number; created_at: string }[];
        const due = captureDue(posts, getSnapshotPoints({ postIds: posts.map((p) => p.id) }), now);
        const last = db.prepare("SELECT started_at FROM sync_runs WHERE mode != 'legacy-import' ORDER BY id DESC LIMIT 1").get() as { started_at: string } | undefined;
        const minutesSince = last ? (now - Date.parse(last.started_at)) / 60000 : Infinity;
        if (!due && minutesSince < 14) {
          say(`skip: nothing due, last sync ${Math.round(minutesSince)} min ago`);
        } else {
          say(due ? `capture: post #${due.postId} at ${due.minutes} min` : "regular 15-minute sync");
          const r = await syncAccount({ mode: "incremental", days: 2, log: (m) => say(`  ${m}`) });
          say(`done: ${r.fetched} fetched, ${r.inserted} new, ${r.snapshots} snapshots, ${r.apiRequests} API requests`);
        }
      } catch (err) {
        failures++;
        console.error(`${tag}auto sync failed: ${err instanceof Error ? err.message : String(err)}`);
        return;
      }
      const c = commentsDue();
      if (c.due) {
        try {
          await syncComments({ log: (m) => say(`${m} (${c.reason})`) });
        } catch (err) {
          console.error(`${tag}comments failed: ${err instanceof Error ? err.message : String(err)}`);
        }
      }
    });
  }
  if (failures) process.exit(1);
}

main().catch((err) => {
  console.error(`auto sync failed: ${err instanceof Error ? err.message : String(err)}`);
  process.exit(1);
});
