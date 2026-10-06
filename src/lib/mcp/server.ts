import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { z } from "zod";
import { getDataset, getSnapshotPoints, getSnapshots, type Dataset } from "../data";
import { applyFilters, dateWindow, inWindow, parseFilters, previousWindow, type Filters } from "../filters";
import { summarize, groupPosts, dimensionValue } from "../analytics/summary";
import { ageLabel, milestones, recentCard, statusOf } from "../analytics/growth";
import { SERIES } from "../classify/rules";
import { activityPeriods, buildActivity, currentStreak } from "../analytics/activity";
import { dataWarnings } from "../warnings";
import { pctChange } from "../stats";
import { slim } from "../slim";
import { MIN_SAMPLE, type GroupRow, type Post, type Summary } from "../analytics/types";
import { runSync, DEFAULT_WINDOW_DAYS } from "../x/sync";
import { XApiError } from "../x/client";

/**
 * MCP server exposing the dashboard's data to Claude Desktop (stdio, local only).
 * Every tool reuses the same library functions as the dashboard pages, so the numbers match.
 * Keep the tool set in step with the dashboard: when a page or metric changes significantly,
 * update the matching tool here (see CLAUDE.md "MCP server").
 */
export const MCP_VERSION = "2.0.0";

const INSTRUCTIONS = `Personal X (Twitter) analytics for one account, read from the local dashboard database.
Rules for interpreting the data:
- "Posts" means original posts and quote posts. Replies, reposts and X Articles are stored but excluded from all aggregates.
- Rates are fractions per impression (0.0142 = 1.42%). Engagement rate = (likes + replies + reposts + quotes + bookmarks) / impressions.
- null means the metric is unavailable from the X API (e.g. private metrics for posts older than ~30 days). It is never zero - do not treat it as 0.
- Prefer medians over averages; always mention the sample size n. Groups with n < ${MIN_SAMPLE} are low sample - do not draw conclusions from them.
- Posts under 48h old ("maturing") are still accumulating; comparisons understate them.
- "series" is the owner's content line: "Animated file" (an animated post built around a file, config, prompt or rule set), "Animated scene" (an animation where something happens) or "Other". It is auto-detected from the headline and corrected by hand, so treat it as a label, not ground truth.
- Early numbers (impressions at 1h / 6h / 24h, same-age rank) exist only where a sync ran near that age; "estimated" values are interpolated between two nearby snapshots. Missing early numbers mean "not captured", not zero.
- "rank" is the post's rank by impressions among all original posts (1 = most).
- Describe reach as "low/high distribution relative to baseline". Never claim X suppressed or boosted a post, and do not invent reasons for the algorithm's behaviour. Correlation is not causation.
- Dates and hours are in Europe/Warsaw time; weeks are ISO weeks (2026-W40).
- run_sync calls the paid X API (about $0.13 per incremental run); only run it when the user asks for fresh data.`;

/* ---------- helpers ---------- */

/** Rounds floats so rates stay readable without losing small values. */
function json(value: unknown): string {
  return JSON.stringify(value, (_k, v) => (typeof v === "number" && !Number.isInteger(v) ? Number(v.toPrecision(4)) : v), 1);
}
const text = (value: unknown) => ({ content: [{ type: "text" as const, text: typeof value === "string" ? value : json(value) }] });
const fail = (message: string) => ({ content: [{ type: "text" as const, text: message }], isError: true });

const RANGE = z.enum(["7d", "30d", "90d", "all"]);
const filterShape = {
  range: RANGE.optional().describe("Rolling window ending today. Ignored when week or from/to is given."),
  week: z.string().regex(/^\d{4}-W\d{2}$/).optional().describe("ISO week, e.g. 2026-W40"),
  from: z.string().regex(/^\d{4}-\d{2}-\d{2}$/).optional().describe("Start date YYYY-MM-DD (Europe/Warsaw)"),
  to: z.string().regex(/^\d{4}-\d{2}-\d{2}$/).optional().describe("End date YYYY-MM-DD (Europe/Warsaw)"),
  series: z.enum(SERIES).optional().describe("The owner's content line"),
  topic: z.string().optional(),
  format: z.string().optional().describe("Text, Image, Video, GIF, Thread, Link, Mixed media"),
  content_type: z.string().optional(),
  hook: z.string().optional().describe("Hook type of the first line"),
  min_impressions: z.number().int().positive().optional(),
  query: z.string().optional().describe("Case-insensitive text search in the post text"),
};
type FilterArgs = { range?: z.infer<typeof RANGE>; week?: string; from?: string; to?: string; series?: string; topic?: string; format?: string; content_type?: string; hook?: string; min_impressions?: number; query?: string; kind?: string };

function toFilters(a: FilterArgs, defaultRange: Filters["range"]): Filters {
  return parseFilters(
    { range: a.range, week: a.week, from: a.from, to: a.to, series: a.series, topic: a.topic, format: a.format, ctype: a.content_type, hook: a.hook, min: a.min_impressions ? String(a.min_impressions) : undefined, q: a.query, kind: a.kind },
    { range: defaultRange }
  );
}

function summaryOut(s: Summary) {
  return {
    n: s.n,
    totalImpressions: s.totalImpressions, medianImpressions: s.medianImpressions, avgImpressions: s.avgImpressions,
    medianEngagementRate: s.medianEngagementRate, pooledEngagementRate: s.pooledEngagementRate, avgEngagementRate: s.avgEngagementRate,
    totalEngagements: s.totalEngagements, totalLikes: s.totalLikes, totalReplies: s.totalReplies, totalReposts: s.totalReposts,
    totalQuotes: s.totalQuotes, totalBookmarks: s.totalBookmarks, totalProfileVisits: s.totalProfileVisits,
    medianLikeRate: s.medianLikeRate, medianReplyRate: s.medianReplyRate, medianRepostRate: s.medianRepostRate,
    medianBookmarkRate: s.medianBookmarkRate, medianProfileVisitRate: s.medianProfileVisitRate,
    postsWithPrivateMetrics: s.nWithPrivate,
  };
}

function groupOut(rows: GroupRow[]) {
  return rows.map(({ postIds: _ids, ...r }) => r);
}

function postRow(p: Post) {
  const s = slim(p, 160);
  return {
    id: s.id, url: s.url, kind: s.kind, date: `${s.localDate} ${s.localTime}`, day: s.dowName, text: s.preview,
    series: s.series, rank: s.rank, topic: s.topic, format: s.format, hook: s.hook, contentType: s.ctype, tagSource: s.classSource,
    impressions: s.impressions, likes: s.likes, replies: s.replies, reposts: s.reposts, quotes: s.quotes, bookmarks: s.bookmarks,
    profileVisits: s.profileVisits, engagementRate: s.engagementRate, bookmarkRate: s.bookmarkRate,
    distributionScore: s.distribution, qualityScore: s.quality, outlier: s.outlier, maturing: s.maturing,
  };
}

function bestWorst(posts: Post[]) {
  const withImp = posts.filter((p) => p.impressions !== null);
  const best = [...withImp].sort((a, b) => (b.impressions as number) - (a.impressions as number))[0];
  const settled = withImp.filter((p) => !p.maturing);
  const worst = [...(settled.length ? settled : withImp)].sort((a, b) => (a.impressions as number) - (b.impressions as number))[0];
  return { best: best ? postRow(best) : null, lowestReach: worst ? postRow(worst) : null };
}

/* ---------- server ---------- */

export interface McpOptions {
  /** Replaceable for tests. */
  sync?: typeof runSync;
  now?: () => Date;
}

export function createMcpServer(opts: McpOptions = {}): McpServer {
  const sync = opts.sync ?? runSync;
  const now = opts.now ?? (() => new Date());
  const server = new McpServer({ name: "x-analytics", version: MCP_VERSION }, { instructions: INSTRUCTIONS });
  const ds = (): Dataset => getDataset();
  const read = { readOnlyHint: true, openWorldHint: false } as const;
  let syncing = false;

  server.registerTool("get_overview", {
    title: "Account overview",
    description: "Headline numbers for a period (same as the dashboard Overview): post count, impressions, engagement, change vs the previous period of equal length, best and lowest-reach post, followers and last sync.",
    inputSchema: { range: RANGE.default("7d").describe("Rolling window ending today") },
    annotations: read,
  }, async ({ range }) => {
    const d = ds();
    if (d.empty) return fail("The database is empty. Run run_sync first.");
    const t = now();
    const f = parseFilters({ range }, { range: "7d" });
    const win = dateWindow(f, t);
    const posts = applyFilters(d.originals, f, t);
    const cur = summarize(posts);
    const pw = previousWindow(f, t);
    const prev = pw ? summarize(d.originals.filter((p) => inWindow(p, pw.start, pw.end))) : null;
    const change = (a: number | null, b: number | null | undefined) => (prev && prev.n ? pctChange(a, b ?? null) : null);
    const followers = d.followers;
    return text({
      window: { label: win.label, start: win.start, end: win.end },
      current: summaryOut(cur),
      previous: prev ? { start: pw!.start, end: pw!.end, ...summaryOut(prev) } : null,
      changeVsPrevious: prev ? {
        posts: pctChange(cur.n, prev.n), totalImpressions: change(cur.totalImpressions, prev.totalImpressions),
        medianImpressions: change(cur.medianImpressions, prev.medianImpressions), medianEngagementRate: change(cur.medianEngagementRate, prev.medianEngagementRate),
        totalEngagements: change(cur.totalEngagements, prev.totalEngagements),
      } : null,
      ...bestWorst(posts),
      maturingPosts: posts.filter((p) => p.maturing).length,
      followers: followers.length ? { latest: followers[followers.length - 1].followers, first: followers[0].followers, firstReadingAt: followers[0].captured_at, readings: followers.length } : null,
      account: d.account.username, lastSync: d.lastSync,
    });
  });

  server.registerTool("list_posts", {
    title: "List posts",
    description: "Stored posts with metrics, tags and scores, filtered and sorted like the dashboard Posts table. Use get_post for the full text and history of one post.",
    inputSchema: {
      ...filterShape,
      kind: z.enum(["original", "reply", "repost", "article", "all"]).default("original").describe("original = posts + quote posts (the analysed set)"),
      sort: z.enum(["date", "impressions", "engagement_rate", "bookmark_rate", "likes", "bookmarks", "distribution", "quality"]).default("date"),
      order: z.enum(["desc", "asc"]).default("desc"),
      limit: z.number().int().min(1).max(200).default(25),
    },
    annotations: read,
  }, async (a) => {
    const d = ds();
    const f = toFilters(a, "30d");
    const posts = applyFilters(d.posts, f, now());
    const key: Record<string, (p: Post) => number | string | null> = {
      date: (p) => p.created_at, impressions: (p) => p.impressions, engagement_rate: (p) => p.engagement_rate, bookmark_rate: (p) => p.bookmark_rate,
      likes: (p) => p.likes, bookmarks: (p) => p.bookmarks, distribution: (p) => p.score?.distribution ?? null, quality: (p) => p.score?.quality ?? null,
    };
    const pick = key[a.sort];
    const dir = a.order === "asc" ? 1 : -1;
    // Unavailable values always sort last, whatever the direction.
    const sorted = [...posts].sort((x, y) => {
      const vx = pick(x), vy = pick(y);
      if (vx === null && vy === null) return 0;
      if (vx === null) return 1;
      if (vy === null) return -1;
      return (vx < vy ? -1 : vx > vy ? 1 : 0) * dir;
    });
    const win = dateWindow(f, now());
    return text({ window: win.label, kind: f.kind, matched: posts.length, returned: Math.min(a.limit, posts.length), summary: summaryOut(summarize(posts.filter((p) => p.isOriginal))), posts: sorted.slice(0, a.limit).map(postRow) });
  });

  server.registerTool("get_post", {
    title: "Post details",
    description: "Everything about one post: full text, tags, all metrics and rates, distribution and engagement-quality scores with their components, expected range from the account baseline, and the metric history (snapshots).",
    inputSchema: {
      id: z.number().int().optional().describe("Internal id (from list_posts)"),
      x_id: z.string().optional().describe("The X post id, or a full x.com status URL"),
      history_limit: z.number().int().min(1).max(500).default(60).describe("Most recent snapshots to include"),
    },
    annotations: read,
  }, async ({ id, x_id, history_limit }) => {
    const d = ds();
    const xid = x_id?.match(/status(?:es)?\/(\d+)/)?.[1] ?? x_id?.trim();
    const p = d.posts.find((q) => (id !== undefined && q.id === id) || (xid && q.x_id === xid));
    if (!p) return fail("Post not found. Use list_posts to find its id.");
    const snaps = getSnapshots(p.id);
    const { score } = p;
    return text({
      id: p.id, xId: p.x_id, url: p.url, kind: p.kind, isArticle: p.isArticle, countedInAnalytics: p.isOriginal,
      published: `${p.localDate} ${p.localTime} (${p.dowName}, ${p.bucket})`, lastSynced: p.last_synced_at, maturing: p.maturing,
      articleTitle: p.article_title, text: p.text,
      rankByImpressions: p.rank, rankedPosts: d.originals.filter((q) => q.rank !== null).length,
      tags: { series: p.series, seriesSource: p.series_source, topic: p.topic, subtopic: p.subtopic, contentType: p.content_type, hook: p.hook_type, isNews: p.is_news === null ? null : !!p.is_news, format: p.format, source: p.class_source },
      structure: { mediaTypes: p.mediaTypes, hasLink: !!p.has_link, threadRoot: !!p.is_thread_root, selfQuote: !!p.is_self_quote, videoDurationMs: p.video_duration_ms },
      metrics: {
        impressions: p.impressions, likes: p.likes, replies: p.replies, reposts: p.reposts, quotes: p.quotes, bookmarks: p.bookmarks,
        profileVisits: p.profile_visits, linkClicks: p.link_clicks, engagementsReportedByX: p.engagements_reported, organicImpressions: p.organic_impressions,
        videoViews: p.video_views, videoPlayback: { p0: p.playback_0, p25: p.playback_25, p50: p.playback_50, p75: p.playback_75, p100: p.playback_100 },
      },
      rates: {
        engagement: p.engagement_rate, like: p.like_rate, reply: p.reply_rate, repost: p.repost_rate, quote: p.quote_rate, bookmark: p.bookmark_rate,
        profileVisit: p.profile_visit_rate, linkClick: p.link_click_rate, videoView: p.video_view_rate, videoCompletion: p.video_completion_rate,
      },
      score: score ? {
        reference: `${score.referenceKind}, n=${score.referenceN}`, distributionPercentile: score.distribution, engagementQuality: score.quality,
        qualityComponents: score.qualityComponents, expectedImpressions: { median: score.expectedMedian, p25: score.expectedLow, p75: score.expectedHigh },
        liftVsExpectedMedian: score.lift, robustZ: score.robustZ, outlier: score.outlier, lowConfidence: score.lowConfidence, diagnosis: score.diagnosis,
      } : null,
      earlyPerformance: p.isOriginal ? milestones(p, getSnapshotPoints({ maxAgeHours: 36 }), d.originals).map((m) => ({
        age: `${m.hours}h`, impressions: m.value ? m.value.value : null, estimated: m.value?.estimated ?? null,
        otherPostsMedian: m.median, n: m.others.length, verdict: m.status ? { status: m.status.status, usualRange: [m.status.low, m.status.high] } : null,
      })) : null,
      history: { snapshots: snaps.length, recent: snaps.slice(-history_limit).map((s) => ({ at: s.captured_at, source: s.source, impressions: s.impressions, likes: s.likes, replies: s.replies, reposts: s.reposts, bookmarks: s.bookmarks, profileVisits: s.profile_visits, videoViews: s.video_views })) },
    });
  });

  server.registerTool("get_breakdown", {
    title: "Performance by group",
    description: "Original posts grouped by a tag or by timing (dashboard Content and Timing pages): n, median and average impressions, median rates and median scores per group. Groups with lowSample=true have fewer than 3 posts.",
    inputSchema: {
      dimension: z.enum(["series", "topic", "subtopic", "content_type", "hook_type", "format", "news", "bucket", "dow", "hour"]).describe("bucket = 3-hour time slot, dow = day of week, hour = hour of day"),
      ...filterShape,
    },
    annotations: read,
  }, async (a) => {
    const d = ds();
    const f = toFilters(a, "90d");
    const posts = applyFilters(d.originals, f, now());
    return text({ window: dateWindow(f, now()).label, dimension: a.dimension, overall: summaryOut(summarize(posts)), groups: groupOut(groupPosts(posts, (p) => dimensionValue(p, a.dimension))) });
  });

  server.registerTool("get_recent_performance", {
    title: "Recent post performance",
    description: "YouTube-style card for each of the last N original posts (dashboard Overview \"Latest post performance\"): age, rank among the recent posts (at the same age when enough early snapshots exist, otherwise by total impressions - check sameAge), impressions after the first hour, and whether impressions, engagement rate and bookmark rate are above, within or below the usual range of the other recent posts (25th-75th percentile, n >= 3).",
    inputSchema: { count: z.number().int().min(1).max(30).default(10).describe("How many recent posts") },
    annotations: read,
  }, async ({ count }) => {
    const d = ds();
    const ids = [...d.originals].sort((a, b) => b.created_at.localeCompare(a.created_at)).slice(0, count).map((p) => p.id);
    const snaps = getSnapshotPoints({ postIds: ids });
    const verdict = (s: ReturnType<typeof statusOf>) => (s ? { status: s.status, usualRange: [s.low, s.high], n: s.n } : null);
    const cards = ids.map((_, i) => recentCard(d.originals, snaps, i, count)).filter((c): c is NonNullable<typeof c> => !!c);
    return text(cards.map((c) => ({
      ...postRow(c.post), age: ageLabel(c.ageHours), ageHours: c.ageHours,
      rank: c.rank ? { rank: c.rank.rank, of: c.rank.of, basis: c.rank.sameAge ? "same age" : "total impressions (different ages)" } : null,
      impressionsVerdict: verdict(c.impressions.status), impressionsBasis: c.impressions.basis,
      firstHour: c.firstHour.value ? { impressions: c.firstHour.value.value, estimated: c.firstHour.value.estimated } : "not captured",
      firstHourVerdict: verdict(c.firstHour.status),
      engagementRateVerdict: verdict(c.engagementRate.status), bookmarkRateVerdict: verdict(c.bookmarkRate.status),
    })));
  });

  server.registerTool("get_outliers", {
    title: "Outliers",
    description: "Posts far above or below the account's own baseline (robust z-score on log impressions vs the 90 days before each post), plus posts with low distribution relative to baseline but high engagement quality.",
    inputSchema: { range: RANGE.default("90d") },
    annotations: read,
  }, async ({ range }) => {
    const d = ds();
    const f = parseFilters({ range }, { range: "90d" });
    const scored = applyFilters(d.originals, f, now()).filter((p) => p.score);
    const withZ = (p: Post) => ({ ...postRow(p), robustZ: p.score!.robustZ, liftVsExpectedMedian: p.score!.lift, expectedImpressions: [p.score!.expectedLow, p.score!.expectedHigh], diagnosis: p.score!.diagnosis });
    return text({
      window: dateWindow(f, now()).label, scoredPosts: scored.length,
      thresholds: "z >= 3.5 far above, z >= 2 above, z <= -2 below",
      outliers: scored.filter((p) => p.score!.outlier).sort((a, b) => (b.score!.robustZ ?? 0) - (a.score!.robustZ ?? 0)).map(withZ),
      lowDistributionHighQuality: scored.filter((p) => p.score!.distribution <= 33 && (p.score!.quality ?? 0) >= 67).map(withZ),
    });
  });

  server.registerTool("get_activity", {
    title: "Posting activity",
    description: "How often the account posts (dashboard Activity page): posts per day, active days, current and longest streak, most common posting hour and format.",
    inputSchema: { period: z.string().default("12m").describe('"12m" for the last 12 months, or a year like "2026"') },
    annotations: read,
  }, async ({ period }) => {
    const d = ds();
    const periods = activityPeriods(d.originals, now());
    const p = periods.find((x) => x.key === period);
    if (!p) return fail(`Unknown period. Available: ${periods.map((x) => x.key).join(", ")}`);
    const a = buildActivity(d.originals, p);
    const cur = currentStreak(d.originals, now());
    return text({
      period: p, posts: a.posts, activeDays: a.activeDays, periodDays: a.periodDays,
      currentStreak: cur, longestStreak: a.longest, busiestDay: a.busiest, peakHour: a.peakHour, topFormat: a.topFormat,
      postsPerDay: a.weeks.flat().filter((c) => c.inPeriod && c.count > 0).map((c) => ({ date: c.date, posts: c.count })),
      availablePeriods: periods.map((x) => x.key),
    });
  });

  server.registerTool("get_data_status", {
    title: "Data status",
    description: "Data freshness and quality: last sync, recent sync runs, data-quality warnings, stored counts, and which metrics the X API returns for this account (capability report).",
    inputSchema: {},
    annotations: read,
  }, async () => {
    const d = ds();
    return text({
      account: d.account, lastSync: d.lastSync, storedPosts: d.posts.length, analysedPosts: d.originals.length, snapshots: d.snapshotCount,
      warnings: dataWarnings(d, now()),
      recentSyncs: d.runs.slice(0, 8).map((r) => ({ startedAt: r.started_at, mode: r.mode, status: r.status, fetched: r.posts_fetched, inserted: r.posts_inserted, snapshots: r.snapshots_saved, apiRequests: r.api_requests, error: r.error })),
      capabilities: d.capabilities.map((c) => ({ metric: c.label, status: c.status, postsWithValue: c.posts_with_value, postsChecked: c.posts_checked, note: c.note })),
    });
  });

  server.registerTool("run_sync", {
    title: "Sync from X (paid)",
    description: `Fetches fresh numbers from the X API and stores a new snapshot for every post (same as the dashboard Sync button). Costs money: an incremental sync reads ~120 own posts at $0.001 each plus one profile lookup ($0.01), about $0.13; re-reading the same posts on the same UTC day is not billed again. Full mode re-reads the whole timeline and costs more. Nothing is ever deleted. Only run when the user asks for fresh data.`,
    inputSchema: {
      mode: z.enum(["incremental", "full"]).default("incremental"),
      days: z.number().int().min(1).max(365).default(DEFAULT_WINDOW_DAYS).describe("Incremental window in days"),
    },
    annotations: { readOnlyHint: false, destructiveHint: false, idempotentHint: false, openWorldHint: true },
  }, async ({ mode, days }) => {
    if (syncing) return fail("A sync is already running.");
    syncing = true;
    try {
      const r = await sync({ mode, days, log: (m) => console.error(`[sync] ${m}`) });
      return text({ ok: true, mode: r.mode, since: r.windowStart, fetched: r.fetched, newPosts: r.inserted, updatedPosts: r.updated, snapshotsSaved: r.snapshots, apiRequests: r.apiRequests, followers: r.account.followers, warnings: r.warnings });
    } catch (err) {
      const kind = err instanceof XApiError ? ` [${err.kind}]` : "";
      return fail(`Sync failed${kind}: ${err instanceof Error ? err.message : String(err)} Existing data was not changed.`);
    } finally {
      syncing = false;
    }
  });

  return server;
}
