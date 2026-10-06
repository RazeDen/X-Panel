import { getDb, getMeta, setMeta, METRIC_KEYS, type MetricValues, type PostRow } from "../db";
import { computeRates } from "../metrics";
import { classifyByRules, deriveFormat, deriveSeries } from "../classify/rules";
import { refreshCapabilities } from "../capabilities";
import { redact } from "../env";
import { XClient, XApiError } from "./client";
import { mapTweet, type MappedPost, type RawIncludes, type RawTweet } from "./map";

/**
 * Sync pipeline.
 *
 *  1. Fetch everything first (profile + timeline pages). If any request fails, nothing is written.
 *  2. In one transaction: upsert posts, append one metric snapshot per post, record the account snapshot.
 *  3. Re-derive structure (threads), fill rule-based tags where no manual/AI tag exists, refresh capabilities.
 *
 * Modes
 *  - incremental (default): posts created in the last N days (default 45). New posts are inserted,
 *    recent posts get fresh metrics + a snapshot. Older posts keep their last known numbers.
 *  - full: the whole timeline (X returns up to the most recent 3,200 posts).
 * An empty database always triggers a full sync.
 *
 * Posts and snapshots are never deleted. A post that stops appearing in the API is only flagged (missing_since).
 */
export const DEFAULT_WINDOW_DAYS = 45;

const TWEET_FIELDS = [
  "created_at", "author_id", "lang", "conversation_id", "in_reply_to_user_id", "referenced_tweets",
  "attachments", "entities", "note_tweet", "article", "public_metrics", "non_public_metrics", "organic_metrics",
].join(",");
// preview_image_url / url only add fields to the existing media expansion: no extra reads, no extra cost.
const MEDIA_FIELDS = "type,duration_ms,preview_image_url,url,public_metrics,non_public_metrics,organic_metrics";
// Referenced posts are deliberately NOT expanded: they would be extra (non-owned) post reads on every sync.
const EXPANSIONS = "attachments.media_keys";

export interface SyncOptions {
  mode?: "incremental" | "full";
  days?: number;
  log?: (msg: string) => void;
  /** Network/5xx retry budget (tests lower it). */
  maxRetries?: number;
  maxRateLimitWaitMs?: number;
}
export interface SyncResult {
  runId: number;
  mode: "incremental" | "full";
  windowStart: string | null;
  fetched: number;
  inserted: number;
  updated: number;
  snapshots: number;
  apiRequests: number;
  warnings: string[];
  account: { username: string; followers: number | null };
  newPostIds: number[];
}

interface TimelinePage {
  data?: RawTweet[];
  includes?: RawIncludes;
  errors?: { resource_id?: string; resource_type?: string; detail?: string; title?: string; parameter?: string }[];
  meta?: { next_token?: string; result_count?: number };
}
interface MeResponse {
  data: { id: string; username: string; name: string; profile_image_url?: string; public_metrics?: Record<string, number> };
}

export async function runSync(opts: SyncOptions = {}): Promise<SyncResult> {
  const db = getDb();
  const log = opts.log ?? (() => {});
  const startedAt = new Date().toISOString();
  const existing = (db.prepare("SELECT COUNT(*) AS n FROM posts").get() as { n: number }).n;
  const mode: "incremental" | "full" = opts.mode === "full" || existing === 0 ? "full" : "incremental";
  const days = Math.max(1, opts.days ?? DEFAULT_WINDOW_DAYS);
  const windowStart = mode === "full" ? null : new Date(Date.now() - days * 86400000).toISOString().replace(/\.\d{3}Z$/, "Z");

  const runId = Number(
    db.prepare("INSERT INTO sync_runs (started_at, mode, status, window_start) VALUES (?, ?, 'running', ?)").run(startedAt, mode, windowStart).lastInsertRowid
  );
  const warnings: string[] = [];
  let client: XClient | null = null;

  try {
    client = new XClient({ log, maxRetries: opts.maxRetries, maxRateLimitWaitMs: opts.maxRateLimitWaitMs });
    /* ---------- 1. fetch ---------- */
    const me = (await client.get<MeResponse>("/users/me", { "user.fields": "public_metrics,created_at,profile_image_url" })).data;
    log(`authenticated as @${me.username}`);

    const tweets = new Map<string, RawTweet>();
    const includes: Required<RawIncludes> = { media: [], tweets: [] };
    let token: string | undefined;
    let pages = 0;
    do {
      const page = await client.get<TimelinePage>(`/users/${me.id}/tweets`, {
        max_results: 100,
        start_time: windowStart ?? undefined,
        pagination_token: token,
        "tweet.fields": TWEET_FIELDS,
        "media.fields": MEDIA_FIELDS,
        expansions: EXPANSIONS,
      });
      pages++;
      for (const t of page.data ?? []) tweets.set(t.id, t);
      includes.media.push(...(page.includes?.media ?? []));
      token = page.meta?.next_token;
      log(`page ${pages}: ${page.data?.length ?? 0} posts`);
    } while (token && pages < 40);
    if (token) warnings.push("Timeline pagination stopped at 40 pages (4,000 posts); older posts were not fetched.");

    const mapped: MappedPost[] = [...tweets.values()].map((t) => mapTweet(t, includes, me));
    const withoutImpressions = mapped.filter((m) => m.kind !== "repost" && m.metrics.impressions === null).length;
    if (withoutImpressions) warnings.push(`${withoutImpressions} post(s) came back without an impression count.`);

    /* ---------- 2. write ---------- */
    const capturedAt = new Date().toISOString();
    const out = db.transaction(() => writePosts(mapped, capturedAt, runId, "api"))();

    const pm = me.public_metrics ?? {};
    db.prepare(
      `INSERT OR IGNORE INTO account_snapshots (captured_at, source, followers, following, post_count, listed, likes_given, media_count)
       VALUES (?, 'api', ?, ?, ?, ?, ?, ?)`
    ).run(capturedAt, pm.followers_count ?? null, pm.following_count ?? null, pm.tweet_count ?? null, pm.listed_count ?? null, pm.like_count ?? null, pm.media_count ?? null);

    // Flag (never delete) posts inside the synced window that X did not return this time.
    const complete = !token;
    if (complete) {
      const ids = new Set(mapped.map((m) => m.x_id));
      const candidates = db.prepare(`SELECT id, x_id, missing_since FROM posts WHERE created_at >= ?`).all(windowStart ?? "0000") as { id: number; x_id: string; missing_since: string | null }[];
      const mark = db.prepare("UPDATE posts SET missing_since = ? WHERE id = ?");
      let missing = 0;
      for (const c of candidates) {
        if (!ids.has(c.x_id)) {
          if (!c.missing_since) mark.run(capturedAt, c.id);
          missing++;
        } else if (c.missing_since) mark.run(null, c.id);
      }
      // X only serves the most recent ~3,200 posts, so absence beyond that is expected.
      if (missing && mapped.length < 3200) warnings.push(`${missing} stored post(s) were not returned by X (deleted or unavailable). Their history is kept.`);
    }

    /* ---------- 3. derive ---------- */
    postProcess();
    refreshCapabilities(capturedAt);
    setMeta("account_id", me.id);
    setMeta("account_username", me.username);
    setMeta("account_name", me.name);
    // Extra field on the existing /users/me request: no additional API cost.
    setMeta("account_avatar", me.profile_image_url ?? null);
    setMeta("last_successful_sync", capturedAt);
    if (mode === "full") setMeta("last_full_sync", capturedAt);

    db.prepare(
      `UPDATE sync_runs SET finished_at = ?, status = 'ok', posts_fetched = ?, posts_inserted = ?, posts_updated = ?,
       snapshots_saved = ?, api_requests = ?, warnings = ? WHERE id = ?`
    ).run(new Date().toISOString(), mapped.length, out.inserted, out.updated, out.snapshots, client.requests, JSON.stringify(warnings), runId);

    return {
      runId, mode, windowStart, fetched: mapped.length, inserted: out.inserted, updated: out.updated, snapshots: out.snapshots,
      apiRequests: client.requests, warnings, account: { username: me.username, followers: pm.followers_count ?? null }, newPostIds: out.newIds,
    };
  } catch (err) {
    const message = redact(err instanceof Error ? err.message : String(err));
    db.prepare("UPDATE sync_runs SET finished_at = ?, status = 'error', error = ?, api_requests = ? WHERE id = ?").run(
      new Date().toISOString(), message, client?.requests ?? 0, runId
    );
    if (err instanceof XApiError) throw err;
    throw new Error(message);
  }
}

const POST_STRUCT_COLS = [
  "url", "text", "short_text", "article_title", "created_at", "kind", "is_self_reply", "is_self_quote", "quoted_is_article",
  "referenced_id", "conversation_id", "in_reply_to_user_id", "lang", "has_media", "has_link", "media_types",
  "video_duration_ms", "media_preview", "external_urls", "non_public_available", "raw_json",
] as const;
const RATE_COLS = [
  "like_rate", "reply_rate", "repost_rate", "quote_rate", "bookmark_rate", "engagement_rate",
  "profile_visit_rate", "link_click_rate", "video_view_rate", "video_completion_rate",
] as const;

/** Upserts posts and appends snapshots. Must be called inside a transaction. */
export function writePosts(
  mapped: MappedPost[],
  capturedAt: string,
  runId: number | null,
  source: "api" | "legacy-import",
  options: { updateCurrent?: boolean } = {}
): { inserted: number; updated: number; snapshots: number; newIds: number[] } {
  const db = getDb();
  const updateCurrent = options.updateCurrent ?? true;
  const find = db.prepare("SELECT id, last_synced_at FROM posts WHERE x_id = ?");
  const cols = [...POST_STRUCT_COLS, ...METRIC_KEYS, ...RATE_COLS];
  const insert = db.prepare(
    `INSERT INTO posts (x_id, first_seen_at, last_synced_at, ${cols.join(", ")})
     VALUES (@x_id, @now, @now, ${cols.map((c) => "@" + c).join(", ")})`
  );
  const update = db.prepare(`UPDATE posts SET last_synced_at = @now, ${cols.map((c) => `${c} = @${c}`).join(", ")} WHERE id = @id`);
  const snap = db.prepare(
    `INSERT OR IGNORE INTO metric_snapshots (post_id, sync_run_id, captured_at, source, ${METRIC_KEYS.join(", ")})
     VALUES (@post_id, @run, @now, @source, ${METRIC_KEYS.map((k) => "@" + k).join(", ")})`
  );

  let inserted = 0, updated = 0, snapshots = 0;
  const newIds: number[] = [];
  for (const m of mapped) {
    const params: Record<string, unknown> = {
      x_id: m.x_id, now: capturedAt,
      url: m.url, text: m.text, short_text: m.short_text, article_title: m.article_title, created_at: m.created_at, kind: m.kind,
      is_self_reply: m.is_self_reply ? 1 : 0, is_self_quote: m.is_self_quote ? 1 : 0, quoted_is_article: 0,
      referenced_id: m.referenced_id, conversation_id: m.conversation_id, in_reply_to_user_id: m.in_reply_to_user_id, lang: m.lang,
      has_media: m.has_media ? 1 : 0, has_link: m.has_link ? 1 : 0, media_types: JSON.stringify(m.media_types),
      video_duration_ms: m.video_duration_ms, media_preview: m.media_preview, external_urls: JSON.stringify(m.external_urls),
      non_public_available: m.non_public_available ? 1 : 0, raw_json: JSON.stringify(m.raw),
      ...m.metrics, ...computeRates(m.metrics),
    };
    const row = find.get(m.x_id) as { id: number; last_synced_at: string } | undefined;
    let postId: number;
    if (!row) {
      postId = Number(insert.run(params).lastInsertRowid);
      inserted++;
      newIds.push(postId);
    } else {
      postId = row.id;
      // Never let an older import overwrite newer numbers.
      if (updateCurrent && row.last_synced_at <= capturedAt) {
        update.run({ ...params, id: postId });
        updated++;
      }
    }
    if (m.kind !== "repost") {
      const r = snap.run({ post_id: postId, run: runId, now: capturedAt, source, ...m.metrics });
      snapshots += r.changes;
    }
  }
  return { inserted, updated, snapshots, newIds };
}

/**
 * A post counts as a thread when it has at least two self-replies; a single self-reply
 * (the usual "link in the reply") does not change its format.
 */
/** Thread detection, format derivation and rule-based tags for anything not tagged by a human or AI. */
export function postProcess(): void {
  const db = getDb();
  db.transaction(() => {
    db.exec(`
      UPDATE posts SET quoted_is_article = CASE WHEN kind = 'quote' AND EXISTS (
        SELECT 1 FROM posts a WHERE a.x_id = posts.referenced_id AND a.article_title IS NOT NULL
      ) THEN 1 ELSE 0 END;
      UPDATE posts SET is_thread_root = CASE WHEN kind IN ('post','quote') AND (
        SELECT COUNT(*) FROM posts r WHERE r.is_self_reply = 1 AND r.conversation_id = posts.x_id AND r.x_id != posts.x_id
      ) >= 2 THEN 1 ELSE 0 END
    `);
    const rows = db.prepare("SELECT * FROM posts").all() as PostRow[];
    const setFormat = db.prepare("UPDATE posts SET format = ?, format_source = 'rule' WHERE id = ?");
    const setSeries = db.prepare("UPDATE posts SET series = ?, series_source = 'rule' WHERE id = ?");
    const setClass = db.prepare(
      "UPDATE posts SET topic = ?, subtopic = ?, content_type = ?, hook_type = ?, is_news = ?, class_source = 'rule', class_updated_at = ? WHERE id = ?"
    );
    const now = new Date().toISOString();
    for (const p of rows) {
      if (p.format_source !== "manual") {
        const format = deriveFormat({
          article: !!p.article_title,
          isThreadRoot: !!p.is_thread_root,
          mediaTypes: safeArray(p.media_types),
          hasLink: !!p.has_link,
        });
        if (format !== p.format || p.format_source !== "rule") setFormat.run(format, p.id);
      }
      if (p.kind !== "repost" && p.series_source !== "manual") {
        const series = deriveSeries(p.text, safeArray(p.media_types));
        if (series !== p.series || p.series_source !== "rule") setSeries.run(series, p.id);
      }
      if (p.kind !== "repost" && (p.class_source === null || p.class_source === "rule")) {
        const c = classifyByRules(p.text, p.article_title);
        const changed = c.topic !== p.topic || c.subtopic !== p.subtopic || c.content_type !== p.content_type || c.hook_type !== p.hook_type;
        if (changed || p.class_source === null) {
          setClass.run(c.topic, c.subtopic, c.content_type, c.hook_type, c.is_news === null ? null : c.is_news ? 1 : 0, now, p.id);
        }
      }
    }
  })();
}

function safeArray(json: string | null): string[] {
  try {
    const v = JSON.parse(json ?? "[]");
    return Array.isArray(v) ? v : [];
  } catch {
    return [];
  }
}

export function lastSuccessfulSync(): string | null {
  return getMeta("last_successful_sync");
}
export type { MetricValues };
