import fs from "node:fs";
import path from "node:path";
import { loadEnv } from "../src/lib/env";
import { getDb } from "../src/lib/db";
import { mapTweet, type RawTweet } from "../src/lib/x/map";
import { writePosts, postProcess } from "../src/lib/x/sync";

/**
 * One-off importer for the JSON files written by the original x_collect.py
 * (posts_YYYY-MM-DD.json). Each file becomes one historical snapshot, timestamped
 * with the moment it was collected. Safe to run repeatedly: snapshots are unique
 * per (post, timestamp) and newer data is never overwritten.
 */
loadEnv();
const dir = path.resolve(process.cwd(), process.argv[2] ?? ".");
const files = fs.readdirSync(dir).filter((f) => /^posts_\d{4}-\d{2}-\d{2}\.json$/.test(f)).sort();
if (!files.length) {
  console.log(`No legacy posts_YYYY-MM-DD.json files found in ${dir}.`);
  process.exit(0);
}
const db = getDb();
for (const f of files) {
  const j = JSON.parse(fs.readFileSync(path.join(dir, f), "utf8")) as {
    collected_at: string;
    account: { id: string; username: string; public_metrics?: Record<string, number> };
    posts: RawTweet[];
  };
  const capturedAt = new Date(j.collected_at).toISOString();
  const mapped = j.posts.map((t) => mapTweet(t, {}, j.account));
  const runId = Number(
    db.prepare("INSERT INTO sync_runs (started_at, finished_at, mode, status, posts_fetched) VALUES (?, ?, 'legacy-import', 'ok', ?)").run(capturedAt, capturedAt, mapped.length).lastInsertRowid
  );
  const out = db.transaction(() => writePosts(mapped, capturedAt, runId, "legacy-import"))();
  const pm = j.account.public_metrics ?? {};
  db.prepare(
    `INSERT OR IGNORE INTO account_snapshots (captured_at, source, followers, following, post_count, listed, likes_given, media_count)
     VALUES (?, 'legacy-import', ?, ?, ?, ?, ?, ?)`
  ).run(capturedAt, pm.followers_count ?? null, pm.following_count ?? null, pm.tweet_count ?? null, pm.listed_count ?? null, pm.like_count ?? null, pm.media_count ?? null);
  db.prepare("UPDATE sync_runs SET posts_inserted = ?, posts_updated = ?, snapshots_saved = ? WHERE id = ?").run(out.inserted, out.updated, out.snapshots, runId);
  console.log(`${f}: ${mapped.length} posts, ${out.snapshots} snapshot(s) added (collected ${capturedAt})`);
}
postProcess();
console.log("Legacy import finished.");
