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
  const { getDb, setMeta: setMetaForTest } = await import("../src/lib/db");
  const { runSync } = await import("../src/lib/x/sync");
  const { XApiError } = await import("../src/lib/x/client");
  const { loadPosts, getDataset, toPost } = await import("../src/lib/data");
  const { impressionsAtAge, statusOf, medianVerdict, captureDue, recentCard, ageLabel, similarReach } = await import("../src/lib/analytics/growth");
  const { saveSeries } = await import("../src/lib/classify/store");
  const { deriveFormat, deriveSeries } = await import("../src/lib/classify/rules");
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
  check("series rules", deriveSeries("ANTHROPIC DESIGNER LEAKED A 6-RULE FILE THAT TURNS OPUS 5.5 INTO AN ART DIRECTOR", ["video"]) === "Animated file"
    && deriveSeries("CLAUDE ANIMATED JEV SORTING 3,412 LEADS IN 15.7 SECONDS - 1,440 FRAMES, 1 HTML FILE", ["video"]) === "Animated scene"
    && deriveSeries("ANTHROPIC ENGINEER LEAKED A FILE WHERE OPUS 5.5 BUILDS A 20-SECOND ANIMATION", ["photo"]) === "Other");
  check("format rules", deriveFormat({ article: false, isThreadRoot: false, mediaTypes: ["video"], hasLink: false }) === "Video" && deriveFormat({ article: true, isThreadRoot: false, mediaTypes: [], hasLink: false }) === "Article" && deriveFormat({ article: false, isThreadRoot: false, mediaTypes: [], hasLink: false }) === "Text");

  console.log("Empty database");
  const db = getDb();
  check("migrations created the tables", (db.prepare("SELECT COUNT(*) AS n FROM sqlite_master WHERE type='table' AND name IN ('posts','metric_snapshots','sync_runs','weekly_reports','capabilities','account_snapshots')").get() as { n: number }).n === 6);
  check("empty dataset loads", getDataset().empty === true && loadPosts().originals.length === 0);

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

  saveSeries(p101.id as number, "Animated scene");
  phase = 2;
  await new Promise((r) => setTimeout(r, 15));
  const second = await withServer(handler, () => runSync({ maxRetries: 0 }));
  check("second sync adds only the new post", second.inserted === 1 && second.updated === 4 && count().p === 5);
  check("no duplicate posts", (db.prepare("SELECT COUNT(*) AS n FROM (SELECT x_id FROM posts GROUP BY x_id HAVING COUNT(*) > 1)").get() as { n: number }).n === 0);
  const snaps = db.prepare("SELECT impressions FROM metric_snapshots WHERE post_id = ? ORDER BY captured_at").all(p101.id) as { impressions: number }[];
  check("history keeps both readings", snaps.length === 2 && snaps[0].impressions === 1000 && snaps[1].impressions === 1500);
  const again = db.prepare("SELECT impressions, series, series_source, topic, hook_type, content_type FROM posts WHERE x_id='101'").get() as { impressions: number; series: string; series_source: string; topic: string | null; hook_type: string | null; content_type: string | null };
  check("latest metrics updated", again.impressions === 1500);
  check("manual format survives a sync", again.series === "Animated scene" && again.series_source === "manual");
  check("topic / type / hook are not derived any more", again.topic === null && again.hook_type === null && again.content_type === null);
  check("account snapshot per sync", (db.prepare("SELECT COUNT(*) AS n FROM account_snapshots").get() as { n: number }).n === 2);

  console.log("Hidden posts");
  const { setHidden: hide } = await import("../src/lib/classify/store");
  const hid103 = (db.prepare("SELECT id FROM posts WHERE x_id='103'").get() as { id: number }).id;
  check("hide a post", hide(hid103, true) && !hide(99999, true));
  const snaps103 = () => (db.prepare("SELECT COUNT(*) AS n FROM metric_snapshots WHERE post_id = ?").get(hid103) as { n: number }).n;
  const before103 = snaps103();
  await withServer((u) => (u.pathname.endsWith("/users/me") ? { status: 200, body: ME } : { status: 200, body: { data: [tweet("103", 300, undefined)], meta: {} } }), () => runSync({ mode: "full", maxRetries: 0 }));
  const h = loadPosts();
  check("hidden post kept and still synced, left out of analysis", count().p === 5 && h.hidden.length === 1 && snaps103() === before103 + 1 && !!h.hidden[0].hidden_at && !h.originals.some((p) => p.x_id === "103") && !h.posts.some((p) => p.x_id === "103"));
  check("hidden post has no rank or score", h.hidden[0].rank === null && h.hidden[0].score === null);
  hide(hid103, false);
  check("restore brings it back", loadPosts().originals.some((p) => p.x_id === "103") && (db.prepare("SELECT hidden_at FROM posts WHERE id = ?").get(hid103) as { hidden_at: string | null }).hidden_at === null);

  console.log("Posts that disappear from the API");
  await withServer((u) => (u.pathname.endsWith("/users/me") ? { status: 200, body: ME } : { status: 200, body: { data: [tweet("101", 100, PM(1600))], meta: {} } }), () => runSync({ mode: "full", maxRetries: 0 }));
  check("nothing is deleted when the API returns fewer posts", count().p === 5);
  check("missing posts are flagged, not removed", (db.prepare("SELECT COUNT(*) AS n FROM posts WHERE missing_since IS NOT NULL").get() as { n: number }).n === 4);

  console.log("Analytics on stored data");
  const { posts, originals } = loadPosts();
  check("originals exclude replies", posts.length === 5 && originals.length === 4);
  const row = db.prepare("SELECT * FROM posts WHERE x_id='102'").get() as import("../src/lib/db").PostRow;
  const art = toPost({ ...row, article_title: "Long read" });
  check("articles are not counted as posts", art.isArticle && !art.isOriginal && toPost(row).isOriginal && applyFilters([art], parseFilters({ kind: "article", range: "all" })).length === 1);
  check("filters: minimum impressions", applyFilters(posts, parseFilters({ min: "1000", range: "all" })).length === 1);
  check("filters: format", applyFilters(posts, parseFilters({ series: "Animated scene", range: "all" })).length === 1);
  check("filters: text search", applyFilters(posts, parseFilters({ q: "post 102", range: "all" })).length === 1);
  check("too little history -> no scores invented", originals.every((p) => p.score === null));
  check("rank by impressions (1 = most)", originals.find((p) => p.x_id === "101")?.rank === 1 && originals.every((p) => p.impressions === null ? p.rank === null : p.rank! >= 1));
  check("series is set on every original", originals.every((p) => !!p.series));
  saveSeries(p101.id as number, "Animated file");
  (await import("../src/lib/x/sync")).postProcess();
  check("manual series survives re-classification", (db.prepare("SELECT series, series_source FROM posts WHERE x_id='101'").get() as { series: string; series_source: string }).series_source === "manual");

  console.log("Early growth (first hour, same-age rank)");
  const t0 = "2026-10-01T10:00:00.000Z";
  const at = (min: number, imp: number | null) => ({ capturedAt: new Date(Date.parse(t0) + min * 60000).toISOString(), impressions: imp });
  check("measured value near the target age", impressionsAtAge(t0, [at(58, 400), at(200, 900)], 1)?.estimated === false && impressionsAtAge(t0, [at(58, 400)], 1)?.value === 400);
  const est = impressionsAtAge(t0, [at(50, 300), at(70, 500)], 1);
  check("interpolated between close snapshots", est?.estimated === true && est.value === 400);
  check("no value when snapshots are far apart", impressionsAtAge(t0, [at(10, 50), at(600, 2000)], 1) === null && impressionsAtAge(t0, [], 1) === null);
  check("status needs 3 comparison posts", statusOf(10, [1, 2]) === null && statusOf(10, [1, 2, 3])?.status === "above" && statusOf(2, [1, 2, 3])?.status === "typical");
  const card = recentCard(originals, new Map(), 0);
  check("latest-post card falls back to total-impressions rank without early data", !!card && (card.rank === null || card.rank.sameAge === false) && card.firstHour.value === null);
  check("first hour vs median: arrow from n=1, n carried", medianVerdict(300, [250])?.status === "above" && medianVerdict(300, [250])?.n === 1 && medianVerdict(100, [250, 400])?.status === "below" && medianVerdict(5, []) === null);
  const due = (ageMin: number, snapAges: number[]) => captureDue([{ id: 1, created_at: t0 }], new Map([[1, snapAges.map((m) => at(m, 10))]]), Date.parse(t0) + ageMin * 60000);
  check("exact capture at 1h / 6h / 24h only", due(61, [])?.minutes === 60 && due(359, [])?.minutes === 360 && due(30, []) === null && due(64, []) === null);
  check("no capture when a snapshot near the mark exists", due(61, [59]) === null);
  const fake = (id: number, impressions: number, er: number) => ({ id, impressions, engagement_rate: er }) as unknown as import("../src/lib/analytics/types").Post;
  const pool = [fake(1, 500, 0.05), fake(2, 1000, 0.03), fake(3, 1200, 0.025), fake(4, 10000, 0.01), fake(5, 900, 0.03)];
  const peers = similarReach(fake(9, 1100, 0.02), pool, 3).map((p) => p.id).sort();
  check("ER compared with posts of similar reach (log scale)", JSON.stringify(peers) === "[2,3,5]");
  check("age label", ageLabel(9 * 24 + 1.5) === "First 9 days 1 hour" && ageLabel(0.5) === "First 30 min");
  check("capability report built", (db.prepare("SELECT status FROM capabilities WHERE key='impressions'").get() as { status: string } | undefined)?.status === "partial");

  console.log("MCP server (Claude Desktop tools)");
  const { createMcpServer } = await import("../src/lib/mcp/server");
  const { Client } = await import("@modelcontextprotocol/sdk/client/index.js");
  const { InMemoryTransport } = await import("@modelcontextprotocol/sdk/inMemory.js");
  let syncCalls = 0;
  const fakeSync = (async () => { syncCalls++; return { runId: 0, mode: "incremental", windowStart: null, fetched: 3, inserted: 1, updated: 2, snapshots: 3, apiRequests: 2, warnings: [], account: { username: "tester", followers: 10 }, newPostIds: [] }; }) as unknown as typeof import("../src/lib/x/sync").runSync;
  const mcpServer = createMcpServer({ sync: fakeSync });
  const [ct, st] = InMemoryTransport.createLinkedPair();
  await mcpServer.connect(st);
  const client = new Client({ name: "selftest", version: "1" });
  await client.connect(ct);
  type ToolResult = { content: { type: string; text: string }[]; isError?: boolean };
  const call = async (name: string, args: Record<string, unknown> = {}) => (await client.callTool({ name, arguments: args })) as ToolResult;
  const body = async (name: string, args: Record<string, unknown> = {}) => JSON.parse((await call(name, args)).content[0].text);
  const tools = (await client.listTools()).tools.map((t) => t.name);
  check("MCP lists all tools", ["get_overview", "list_posts", "get_post", "get_breakdown", "get_recent_performance", "get_outliers", "get_activity", "get_data_status", "list_comments", "run_sync"].every((t) => tools.includes(t)), tools.join(","));
  check("MCP overview matches the dashboard set", (await body("get_overview", { range: "all" })).current.n === originals.length);
  const listed = await body("list_posts", { range: "all", sort: "impressions" });
  check("MCP list_posts filters and sorts", listed.matched === originals.length && listed.posts[0].impressions >= listed.posts[1].impressions);
  const one = await body("get_post", { x_id: "https://x.com/tester/status/101" });
  check("MCP get_post by URL with history", one.metrics.impressions === 1600 && one.history.snapshots === 3 && one.metrics.linkClicks === null);
  check("MCP unknown post is an error, not empty data", (await call("get_post", { id: 99999 })).isError === true);
  check("MCP weekly report tool is gone", !tools.includes("get_weekly_report"));
  const recent = await body("get_recent_performance", { count: 3 });
  check("MCP recent performance cards", Array.isArray(recent) && recent.length === 3 && "firstHour" in recent[0] && "rank" in recent[0]);
  check("MCP bait is gone", (await call("get_breakdown", { dimension: "bait", range: "all" })).isError === true && !("bait" in listed.posts[0]) && !("bait" in one.tags));
  check("MCP breakdown by series", (await body("get_breakdown", { dimension: "series", range: "all" })).groups.some((g: { key: string }) => g.key === "Animated file"));
  check("MCP get_post has early performance and rank", Array.isArray(one.earlyPerformance) && one.rankByImpressions === 1);
  check("MCP breakdown carries sample size", (await body("get_breakdown", { dimension: "series", range: "all" })).groups.every((g: { n: number; lowSample: boolean }) => typeof g.n === "number" && typeof g.lowSample === "boolean"));
  check("MCP data status", (await body("get_data_status")).storedPosts === posts.length);
  const { setHidden } = await import("../src/lib/classify/store");
  const hid102 = (db.prepare("SELECT id FROM posts WHERE x_id='102'").get() as { id: number }).id;
  setHidden(hid102, true);
  check("MCP hidden post left out of lists and numbers", (await body("list_posts", { range: "all" })).matched === originals.length - 1 && (await body("get_overview", { range: "all" })).current.n === originals.length - 1);
  const hid = await body("get_post", { x_id: "102" });
  const status = await body("get_data_status");
  check("MCP hidden post still found, flagged and counted", hid.hidden === true && hid.countedInAnalytics === false && status.hiddenPosts === 1 && status.storedPosts === posts.length);
  setHidden(hid102, false);
  check("MCP restored post is back", (await body("list_posts", { range: "all" })).matched === originals.length);
  const synced = await body("run_sync", {});
  check("MCP run_sync uses the sync pipeline", synced.ok === true && synced.newPosts === 1 && syncCalls === 1);
  await client.close();

  console.log("Comments (twitterapi.io mock)");
  const { commentsDue, syncComments, stripReplyMentions, checkOwnReplies } = await import("../src/lib/comments/sync");
  const { listComments, setCommentHidden, draftMessage, commentCounts } = await import("../src/lib/comments/data");
  delete process.env.TWITTERAPI_IO_KEY;
  check("no comment requests without a key", commentsDue().due === false);
  process.env.TWITTERAPI_IO_KEY = "test-twitterapi-key";
  const tw = (id: string, authorId: string, extra: Record<string, unknown> = {}) => ({
    id, text: `@tester comment ${id} - how did you build it?`, createdAt: new Date(Date.now() - 3600000).toUTCString(), isReply: true,
    inReplyToId: "101", inReplyToUserId: "1", inReplyToUsername: "tester", conversationId: "101", likeCount: 2,
    author: { id: authorId, userName: `user${authorId}`, name: `User ${authorId}`, profilePicture: "https://pbs.twimg.com/p.jpg" }, ...extra,
  });
  let keyHeader = "", mentionCalls = 0;
  const twServer = http.createServer((req, res) => {
    mentionCalls++;
    keyHeader = String(req.headers["x-api-key"] ?? "");
    const path = new URL(req.url ?? "/", "http://x").pathname;
    if (path === "/twitter/tweet/advanced_search") {
      // The owner's latest tweets: a reply to comment 901, an original post and a reply to someone else.
      const own = (id: string, extra: Record<string, unknown>) => ({ id, text: `@user7 own ${id}`, url: `https://x.com/tester/status/${id}`, createdAt: new Date().toUTCString(), author: { id: "1", userName: "tester" }, ...extra });
      res.writeHead(200, { "content-type": "application/json" });
      res.end(JSON.stringify({ status: "success", has_next_page: false, tweets: [own("962", { inReplyToId: "777" }), own("961", {}), own("960", { isReply: true, inReplyToId: "901" })] }));
      return;
    }
    const ok = path === "/twitter/user/mentions";
    res.writeHead(ok ? 200 : 404, { "content-type": "application/json" });
    res.end(JSON.stringify(ok ? { status: "success", has_next_page: false, next_cursor: "", tweets: [
      tw("901", "7"),                                                     // a real comment on post 101
      tw("902", "1"),                                                     // the owner's own tweet
      tw("903", "8", { isReply: false, inReplyToId: null, inReplyToUserId: null, inReplyToUsername: null }), // plain mention
      tw("904", "9", { inReplyToUserId: "55", inReplyToUsername: "someone" }), // reply to another account
    ] } : { status: "error", msg: "not found" }));
  });
  await new Promise<void>((r) => twServer.listen(0, "127.0.0.1", r));
  process.env.TWITTERAPI_IO_BASE = `http://127.0.0.1:${(twServer.address() as AddressInfo).port}`;
  check("first comment check is due", commentsDue().due === true);
  const c1 = await syncComments();
  check("only replies to the owner by others are stored", c1.inserted === 1 && c1.requests === 1 && listComments().length === 1 && keyHeader === "test-twitterapi-key");
  const c2 = await syncComments();
  check("a comment read again is updated, not duplicated", c2.inserted === 0 && c2.updated === 1 && listComments().length === 1);
  check("no request when nothing changed, fallback after an hour", commentsDue().due === false && commentsDue(new Date(Date.now() + 61 * 60000)).due === true);
  const open = listComments("open");
  check("comment shows its post and author, reply mentions stripped", open.length === 1 && open[0].parent?.xId === "101" && open[0].author.username === "user7" && open[0].text.startsWith("comment 901") && stripReplyMentions("@a @b hi") === "hi");
  const msg = draftMessage(open[0]);
  check("draft text has the post and the comment", msg.startsWith("Post:\npost 101") && msg.includes("Comment by @user7:\ncomment 901"));
  check("unanswered comments expire after 30 hours", commentCounts(new Date(Date.now() + 30 * 3600000)).open === 0 && commentCounts(new Date(Date.now() + 30 * 3600000)).expired === 1 && commentCounts().open === 1);
  check("hide and restore a comment", setCommentHidden("901", true) && commentCounts().hidden === 1 && commentCounts().open === 0 && setCommentHidden("901", false) && commentCounts().open === 1);
  const rc = await checkOwnReplies();
  check("Check now finds the owner's reply and the comment leaves the list", rc.requests === 1 && rc.answered === 1 && commentCounts().open === 0
    && listComments("answered")[0]?.myReply?.url === "https://x.com/tester/status/960");
  db.prepare("UPDATE comments SET my_reply_id = NULL, my_reply_text = NULL, my_reply_url = NULL").run();
  const now2 = new Date().toISOString();
  db.prepare("INSERT INTO posts (x_id, url, text, created_at, first_seen_at, last_synced_at, kind, referenced_id) VALUES ('950', 'https://x.com/tester/status/950', '@user7 with Claude', ?, ?, ?, 'reply', '901')").run(now2, now2, now2);
  const answered = listComments("answered");
  check("own reply marks the comment answered", answered.length === 1 && answered[0].myReply?.text === "with Claude" && commentCounts().open === 0);
  check("no reply check request when nothing is open", (await checkOwnReplies()).requests === 0);
  process.env.TWITTERAPI_IO_BASE = "http://127.0.0.1:9";
  setMetaForTest("comments_last_fetch", null);
  let failedCheck = false;
  try { await syncComments(); } catch { failedCheck = true; }
  check("a failed comment check is reported and stored", failedCheck && !!(db.prepare("SELECT value FROM meta WHERE key = 'comments_last_error'").get() as { value: string | null }).value);
  const mcp2 = createMcpServer({ sync: fakeSync });
  const [ct2, st2] = InMemoryTransport.createLinkedPair();
  await mcp2.connect(st2);
  const client2 = new Client({ name: "selftest", version: "1" });
  await client2.connect(ct2);
  const lc = JSON.parse(((await client2.callTool({ name: "list_comments", arguments: { status: "all" } })) as ToolResult).content[0].text);
  check("MCP list_comments", lc.matched === 1 && lc.comments[0].status === "answered" && lc.comments[0].author === "@user7" && Array.isArray(lc.myRecentReplies) && typeof lc.counts.open === "number");
  await client2.close();
  await new Promise((r) => twServer.close(r));

  console.log("Second account (twitterapi.io mock)");
  const { accounts, withAccount } = await import("../src/lib/accounts");
  const { syncAccount } = await import("../src/lib/x/run");
  const { getMeta } = await import("../src/lib/db");
  process.env.TWITTERAPI_ACCOUNTS = "Testtwo, bad handle!, @tester2";
  check("extra accounts come from TWITTERAPI_ACCOUNTS", JSON.stringify(accounts().map((a) => `${a.key}:${a.source}`)) === JSON.stringify(["main:x", "testtwo:twitterapi", "tester2:twitterapi"]));
  const mainPosts = (db.prepare("SELECT COUNT(*) AS n FROM posts").get() as { n: number }).n;
  const ago = (h: number) => new Date(Date.now() - h * 3600000).toUTCString();
  const T2 = { id: "200", userName: "Testtwo", name: "Test Two", profilePicture: "https://pbs.twimg.com/t2.jpg" };
  const tt = (id: string, h: number, extra: Record<string, unknown> = {}) => ({ id, text: `two ${id}`, createdAt: ago(h), viewCount: 500, likeCount: 10, replyCount: 1, retweetCount: 2, quoteCount: 0, bookmarkCount: 4, author: T2, ...extra });
  let views = 500;
  const twoCalls: string[] = [];
  const twoServer = http.createServer((req, res) => {
    const u = new URL(req.url ?? "/", "http://x");
    twoCalls.push(u.pathname);
    let body: unknown = { status: "error", msg: "unknown path" };
    if (u.pathname === "/twitter/user/info") body = { status: "success", data: { ...T2, followers: 50, following: 5, statusesCount: 5 } };
    if (u.pathname === "/twitter/user/last_tweets") body = u.searchParams.get("cursor") === "p2"
      ? { status: "success", data: { tweets: [tt("204", 80, { isReply: true, inReplyToId: "203", inReplyToUserId: "200", inReplyToUsername: "Testtwo", conversationId: "203" })] }, has_next_page: false }
      : { status: "success", has_next_page: true, next_cursor: "p2", data: { tweets: [
        tt("201", 30, { extendedEntities: { media: [{ type: "video", media_url_https: "https://pbs.twimg.com/v.jpg", video_info: { duration_millis: 9000 } }] } }),
        tt("202", 40, { quoted_tweet: { id: "999", author: { id: "7" } } }),
        tt("203", 90),
        tt("205", 95, { retweeted_tweet: { id: "888", author: { id: "7" } } }),
        tt("206", 20, { author: { id: "7", userName: "someone" } }),
        tt("208", 100, { text: "https://t.co/x", article: { title: "Long read", preview_text: "Start", cover_media_img_url: "https://pbs.twimg.com/c.jpg" } }),
      ] } };
    if (u.pathname === "/twitter/tweet/advanced_search") body = { status: "success", has_next_page: false, tweets: [tt("207", 1)] };
    if (u.pathname === "/twitter/tweets") body = { status: "success", tweets: (u.searchParams.get("tweet_ids") ?? "").split(",").map((id) => tt(id, 30, { viewCount: views })) };
    res.writeHead(200, { "content-type": "application/json" });
    res.end(JSON.stringify(body));
  });
  await new Promise<void>((r) => twoServer.listen(0, "127.0.0.1", r));
  process.env.TWITTERAPI_IO_BASE = `http://127.0.0.1:${(twoServer.address() as AddressInfo).port}`;
  const full2 = await withAccount("testtwo", () => syncAccount({}));
  const two = withAccount("testtwo", () => ({ db: getDb(), data: loadPosts() }));
  const row2 = (id: string) => two.db.prepare("SELECT * FROM posts WHERE x_id = ?").get(id) as import("../src/lib/db").PostRow;
  check("second account has its own database", two.db !== db && full2.mode === "full" && full2.inserted === 6 && (db.prepare("SELECT COUNT(*) AS n FROM posts").get() as { n: number }).n === mainPosts);
  check("timeline mapped: kinds, media, other authors dropped", row2("201").kind === "post" && row2("201").media_preview === "https://pbs.twimg.com/v.jpg" && row2("201").video_duration_ms === 9000 && row2("202").kind === "quote"
    && row2("204").kind === "reply" && row2("204").is_self_reply === 1 && row2("205").kind === "repost" && !row2("206")
    && row2("208").article_title === "Long read" && row2("208").media_preview === "https://pbs.twimg.com/c.jpg" && !two.data.originals.some((p) => p.x_id === "208"));
  check("public metrics only: impressions = viewCount, private stay null", row2("201").impressions === 500 && row2("201").bookmarks === 4 && row2("201").profile_visits === null && row2("201").video_views === null && row2("205").impressions === null);
  check("profile and followers stored per account", withAccount("testtwo", () => getMeta("account_username")) === "Testtwo" && getMeta("account_username") === "tester"
    && (two.db.prepare("SELECT followers FROM account_snapshots ORDER BY id DESC").get() as { followers: number }).followers === 50);
  views = 700;
  twoCalls.length = 0;
  const inc2 = await withAccount("testtwo", () => syncAccount({ mode: "incremental", days: 2 }));
  check("incremental: one search for new posts + refresh by id, no timeline paging", inc2.mode === "incremental" && inc2.inserted === 1 && row2("207")?.kind === "post"
    && row2("201").impressions === 700 && twoCalls.join(",") === "/twitter/user/info,/twitter/tweet/advanced_search,/twitter/tweets");
  check("refresh appends a snapshot (history kept)", (two.db.prepare("SELECT COUNT(*) AS n FROM metric_snapshots WHERE post_id = ?").get(row2("201").id) as { n: number }).n === 2);
  const mcp3 = createMcpServer({ sync: fakeSync });
  const [ct3, st3] = InMemoryTransport.createLinkedPair();
  await mcp3.connect(st3);
  const client3 = new Client({ name: "selftest", version: "1" });
  await client3.connect(ct3);
  const tool3 = async (name: string, args: Record<string, unknown>) => JSON.parse(((await client3.callTool({ name, arguments: args })) as ToolResult).content[0].text);
  const lp2 = await tool3("list_posts", { range: "all", account: "testtwo" });
  const lpMain = await tool3("list_posts", { range: "all" });
  check("MCP tools take an account", lp2.posts.every((p: { url: string }) => p.url.includes("/Testtwo/")) && lp2.matched === two.data.originals.length + 1 && lpMain.posts.every((p: { url: string }) => p.url.includes("/tester/")));
  check("MCP rejects an unknown account", ((await client3.callTool({ name: "get_overview", arguments: { account: "nobody" } })) as ToolResult).isError === true);
  await client3.close();
  await new Promise((r) => twoServer.close(r));
  withAccount("testtwo", () => getDb().close());

  db.close();
  fs.rmSync(tmp, { recursive: true, force: true });
  console.log(`\n${passed} passed, ${failed} failed`);
  process.exit(failed ? 1 : 0);
}
main().catch((e) => { console.error(e); process.exit(1); });
