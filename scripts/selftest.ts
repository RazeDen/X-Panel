/**
 * npm test - self-contained checks against a temporary database and a local mock of the X API.
 * Nothing here touches data/analytics.db or the real X API, and no credits are spent.
 */
import fs from "node:fs";
import http from "node:http";
import os from "node:os";
import path from "node:path";
import type { AddressInfo } from "node:net";

const tmp = fs.mkdtempSync(path.join(os.tmpdir(), "xa-test-"));
process.env.ANALYTICS_DB = path.join(tmp, "test.db");
for (const k of ["X_CONSUMER_KEY", "X_CONSUMER_SECRET", "X_ACCESS_TOKEN", "X_ACCESS_TOKEN_SECRET"]) process.env[k] = "test-" + k.toLowerCase();

let passed = 0, failed = 0;
function check(name: string, ok: boolean, detail = "") {
  if (ok) passed++;
  else failed++;
  console.log(`${ok ? "  ok  " : "  FAIL"} ${name}${!ok && detail ? ` -> ${detail}` : ""}`);
}

type Handler = (url: URL) => { status: number; body: unknown; headers?: Record<string, string> };
async function withServer<T>(handler: Handler, run: () => Promise<T>): Promise<T> {
  const server = http.createServer((req, res) => {
    const r = handler(new URL(req.url ?? "/", "http://x"));
    res.writeHead(r.status, { "content-type": "application/json", ...(r.headers ?? {}) });
    res.end(JSON.stringify(r.body));
  });
  await new Promise<void>((r) => server.listen(0, "127.0.0.1", r));
  process.env.X_API_BASE = `http://127.0.0.1:${(server.address() as AddressInfo).port}/2`;
  try {
    return await run();
  } finally {
    await new Promise((r) => server.close(r));
  }
}

const ME = { data: { id: "1", username: "tester", name: "Tester", public_metrics: { followers_count: 10, following_count: 1, tweet_count: 3, listed_count: 0 } } };
const iso = (hoursAgo: number) => new Date(Date.now() - hoursAgo * 3600000).toISOString();
const tweet = (id: string, hoursAgo: number, pm: Record<string, number> | undefined, extra: Record<string, unknown> = {}) => ({ id, text: `post ${id} about Claude with $100 result`, created_at: iso(hoursAgo), author_id: "1", public_metrics: pm, ...extra });
const PM = (imp: number, likes = 5) => ({ impression_count: imp, like_count: likes, reply_count: 1, retweet_count: 2, quote_count: 0, bookmark_count: 3 });

async function main() {
  const { median, mad, percentileRank, pctChange, ratio, quantile } = await import("../src/lib/stats");
  const { computeRates } = await import("../src/lib/metrics");
  const { weekOfDate, weekFromKey, localParts, bucketOfHour } = await import("../src/lib/time");
  const { getDb } = await import("../src/lib/db");
  const { runSync } = await import("../src/lib/x/sync");
  const { XApiError } = await import("../src/lib/x/client");
  const { loadPosts, getDataset } = await import("../src/lib/data");
  const { buildWeeklyReport } = await import("../src/lib/analytics/weekly");
  const { saveClassification } = await import("../src/lib/classify/store");
  const { classifyByRules, deriveFormat } = await import("../src/lib/classify/rules");
  const { applyFilters, parseFilters } = await import("../src/lib/filters");
  const { dataWarnings } = await import("../src/lib/warnings");

  console.log("Statistics");
  check("median of even set", median([1, 2, 3, 10]) === 2.5);
  check("median ignores nulls", median([null, 4, undefined, 6]) === 5);
  check("median of empty set is null", median([]) === null);
  check("MAD", mad([1, 2, 3, 4, 100]) === 1);
  check("quantile", quantile([0, 10], 0.25) === 2.5);
  check("percentile rank (mid-rank)", percentileRank([1, 2, 3, 4], 3) === 62.5);
  check("pctChange with zero base is null", pctChange(5, 0) === null);
  check("ratio never divides by zero", ratio(5, 0) === null && ratio(null, 10) === null && ratio(0, 10) === 0);

  console.log("Rates and missing metrics");
  const none = { impressions: null, likes: null, replies: null, reposts: null, quotes: null, bookmarks: null, profile_visits: null, link_clicks: null, engagements_reported: null, organic_impressions: null, video_views: null, playback_0: null, playback_25: null, playback_50: null, playback_75: null, playback_100: null };
  const r0 = computeRates({ ...none, impressions: 0, likes: 3 });
  check("zero impressions -> null rates", r0.like_rate === null && r0.engagement_rate === null);
  const r1 = computeRates({ ...none, impressions: 1000, likes: 10, replies: 1, reposts: 2, quotes: 0, bookmarks: 7 });
  check("engagement rate formula", r1.engagement_rate === 0.02 && r1.like_rate === 0.01);
  check("unavailable metric -> null rate, not 0", r1.profile_visit_rate === null && r1.link_click_rate === null);

  console.log("Calendar (Europe/Warsaw)");
  check("ISO week of 2026-09-28", weekOfDate("2026-09-28").key === "2026-W40" && weekOfDate("2026-10-04").key === "2026-W40");
  check("week key round trip", weekFromKey("2026-W40")?.start === "2026-09-28" && weekFromKey("2026-W40")?.end === "2026-10-04");
  check("year boundary week", weekOfDate("2027-01-01").key === "2026-W53");
  check("UTC -> local date across midnight", localParts("2026-10-01T22:21:00.000Z").date === "2026-10-02" && localParts("2026-10-01T22:21:00.000Z").hour === 0);
  check("time buckets", bucketOfHour(0) === "00:00-06:00" && bucketOfHour(20) === "18:00-21:00" && bucketOfHour(23) === "21:00-00:00");

  console.log("Classification");
  const c = classifyByRules("ANTHROPIC ENGINEER LEAKED A FILE WHERE OPUS 5.5 BUILDS AN ANIMATION\n\nmore text");
  check("rule classifier tags topic and hook", c.topic === "Claude" && c.hook_type === "Leak", JSON.stringify(c));
  check("format rules", deriveFormat({ article: false, isThreadRoot: false, mediaTypes: ["video"], hasLink: false }) === "Video" && deriveFormat({ article: true, isThreadRoot: false, mediaTypes: [], hasLink: false }) === "Article" && deriveFormat({ article: false, isThreadRoot: false, mediaTypes: [], hasLink: false }) === "Text");

  console.log("Empty database");
  const db = getDb();
  check("migrations created the tables", (db.prepare("SELECT COUNT(*) AS n FROM sqlite_master WHERE type='table' AND name IN ('posts','metric_snapshots','sync_runs','weekly_reports','capabilities','account_snapshots')").get() as { n: number }).n === 6);
  check("empty dataset loads", getDataset().empty === true && loadPosts().originals.length === 0);
  check("weekly report on empty data", buildWeeklyReport([], "2026-W40")?.summary.n === 0);

  console.log("API failure handling");
  const count = () => (db.prepare("SELECT (SELECT COUNT(*) FROM posts) AS p, (SELECT COUNT(*) FROM metric_snapshots) AS s").get() as { p: number; s: number });
  process.env.X_API_BASE = "http://127.0.0.1:9/2";
  let err: unknown = null;
  try { await runSync({ maxRetries: 0 }); } catch (e) { err = e; }
  check("unreachable API -> network error", err instanceof XApiError && err.kind === "network", String(err));
  err = null;
  await withServer(() => ({ status: 401, body: { title: "Unauthorized", detail: "Unauthorized" } }), async () => { try { await runSync({ maxRetries: 0 }); } catch (e) { err = e; } });
  check("401 -> auth error", err instanceof XApiError && (err as InstanceType<typeof XApiError>).kind === "auth");
  check("error message does not contain credentials", !String((err as Error)?.message).includes("test-x_"));
  err = null;
  await withServer((u) => (u.pathname.endsWith("/users/me") ? { status: 200, body: ME } : { status: 429, body: {}, headers: { "x-rate-limit-reset": String(Math.floor(Date.now() / 1000) + 900) } }),
    async () => { try { await runSync({ maxRetries: 0, maxRateLimitWaitMs: 1000 }); } catch (e) { err = e; } });
  check("429 with a long reset -> rate_limit error, no hang", err instanceof XApiError && (err as InstanceType<typeof XApiError>).kind === "rate_limit");
  err = null;
  await withServer((u) => (u.pathname.endsWith("/users/me") ? { status: 200, body: ME } : u.searchParams.get("pagination_token") ? { status: 500, body: {} } : { status: 200, body: { data: [tweet("900", 5, PM(100))], meta: { next_token: "p2" } } }),
    async () => { try { await runSync({ maxRetries: 0 }); } catch (e) { err = e; } });
  check("failure on page 2 -> nothing written", err instanceof XApiError && count().p === 0 && count().s === 0);
  const runs = db.prepare("SELECT status, error FROM sync_runs ORDER BY id").all() as { status: string; error: string | null }[];
  check("failed runs are logged with an error", runs.length === 4 && runs.every((r) => r.status === "error" && !!r.error));
  check("dashboard warns about the failed sync", dataWarnings(getDataset()).some((w) => w.level === "error"));

  console.log("Sync, pagination, duplicates, snapshots");
  let phase = 1;
  const handler: Handler = (u) => {
    if (u.pathname.endsWith("/users/me")) return { status: 200, body: ME };
    if (u.searchParams.get("pagination_token") === "p2") {
      return { status: 200, body: { data: [tweet("103", 300, undefined), tweet("104", 30, PM(50), { referenced_tweets: [{ type: "replied_to", id: "5" }], in_reply_to_user_id: "9" })], meta: {} } };
    }
    return {
      status: 200,
      body: {
        data: [
          tweet("101", 100, PM(phase === 1 ? 1000 : 1500, phase === 1 ? 10 : 14), { non_public_metrics: { user_profile_clicks: 4, engagements: 30, impression_count: 1000 }, attachments: { media_keys: ["13_1"] } }),
          tweet("102", 200, PM(0)),
          ...(phase === 2 ? [tweet("105", 2, PM(20))] : []),
        ],
        includes: { media: [{ media_key: "13_1", type: "video", duration_ms: 20000, public_metrics: { view_count: 400 }, non_public_metrics: { playback_0_count: 500, playback_25_count: 200, playback_50_count: 100, playback_75_count: 60, playback_100_count: 50 } }] },
        meta: { next_token: "p2" },
      },
    };
  };
  const first = await withServer(handler, () => runSync({ maxRetries: 0 }));
  check("first sync is a full sync with pagination", first.mode === "full" && first.fetched === 4 && first.inserted === 4 && first.apiRequests === 3);
  check("one snapshot per post", count().p === 4 && count().s === 4);
  const p103 = db.prepare("SELECT impressions, like_rate, engagement_rate FROM posts WHERE x_id='103'").get() as { impressions: number | null; like_rate: number | null; engagement_rate: number | null };
  check("post without metrics is stored as NULL, not 0", p103.impressions === null && p103.like_rate === null && p103.engagement_rate === null);
  const p102 = db.prepare("SELECT impressions, like_rate FROM posts WHERE x_id='102'").get() as { impressions: number; like_rate: number | null };
  check("real zero stays zero; its rates are NULL", p102.impressions === 0 && p102.like_rate === null);
  const p101 = db.prepare("SELECT * FROM posts WHERE x_id='101'").get() as Record<string, number | string | null>;
  check("private + video metrics mapped", p101.profile_visits === 4 && p101.link_clicks === null && p101.video_views === 400 && p101.video_completion_rate === 0.1 && p101.format === "Video");
  check("reply is stored but not an original", (db.prepare("SELECT kind FROM posts WHERE x_id='104'").get() as { kind: string }).kind === "reply");

  saveClassification(p101.id as number, { topic: "My Topic", hook_type: "My Hook" }, "manual");
  phase = 2;
  await new Promise((r) => setTimeout(r, 15));
  const second = await withServer(handler, () => runSync({ maxRetries: 0 }));
  check("second sync adds only the new post", second.inserted === 1 && second.updated === 4 && count().p === 5);
  check("no duplicate posts", (db.prepare("SELECT COUNT(*) AS n FROM (SELECT x_id FROM posts GROUP BY x_id HAVING COUNT(*) > 1)").get() as { n: number }).n === 0);
  const snaps = db.prepare("SELECT impressions FROM metric_snapshots WHERE post_id = ? ORDER BY captured_at").all(p101.id) as { impressions: number }[];
  check("history keeps both readings", snaps.length === 2 && snaps[0].impressions === 1000 && snaps[1].impressions === 1500);
  const again = db.prepare("SELECT impressions, topic, hook_type, class_source FROM posts WHERE x_id='101'").get() as { impressions: number; topic: string; hook_type: string; class_source: string };
  check("latest metrics updated", again.impressions === 1500);
  check("manual tags survive a sync", again.topic === "My Topic" && again.hook_type === "My Hook" && again.class_source === "manual");
  check("account snapshot per sync", (db.prepare("SELECT COUNT(*) AS n FROM account_snapshots").get() as { n: number }).n === 2);

  console.log("Posts that disappear from the API");
  await withServer((u) => (u.pathname.endsWith("/users/me") ? { status: 200, body: ME } : { status: 200, body: { data: [tweet("101", 100, PM(1600))], meta: {} } }), () => runSync({ mode: "full", maxRetries: 0 }));
  check("nothing is deleted when the API returns fewer posts", count().p === 5);
  check("missing posts are flagged, not removed", (db.prepare("SELECT COUNT(*) AS n FROM posts WHERE missing_since IS NOT NULL").get() as { n: number }).n === 4);

  console.log("Analytics on stored data");
  const { posts, originals } = loadPosts();
  check("originals exclude replies", posts.length === 5 && originals.length === 4);
  check("filters: minimum impressions", applyFilters(posts, parseFilters({ min: "1000", range: "all" })).length === 1);
  check("filters: topic", applyFilters(posts, parseFilters({ topic: "My Topic", range: "all" })).length === 1);
  check("filters: text search", applyFilters(posts, parseFilters({ q: "post 102", range: "all" })).length === 1);
  check("too little history -> no scores invented", originals.every((p) => p.score === null));
  const wk = originals[0].weekKey;
  const rep = buildWeeklyReport(originals, wk)!;
  const inWeek = originals.filter((p) => p.weekKey === wk);
  check("weekly totals match their posts", rep.summary.n === inWeek.length && (rep.summary.totalImpressions ?? 0) === inWeek.reduce((a, p) => a + (p.impressions ?? 0), 0));
  check("small weeks carry a sample-size warning", rep.summary.n >= 3 || rep.warnings.some((w) => /Only \d+ post/.test(w)));
  check("capability report built", (db.prepare("SELECT status FROM capabilities WHERE key='impressions'").get() as { status: string } | undefined)?.status === "partial");

  db.close();
  fs.rmSync(tmp, { recursive: true, force: true });
  console.log(`\n${passed} passed, ${failed} failed`);
  process.exit(failed ? 1 : 0);
}
main().catch((e) => { console.error(e); process.exit(1); });
