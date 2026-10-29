import { getDb, getMeta, setMeta, type MetricValues, type PostKind } from "../db";
import { currentAccount } from "../accounts";
import { refreshCapabilities } from "../capabilities";
import { redact } from "../env";
import { twitterApiGet, type TwitterApiTweet, type TwitterApiUser } from "../comments/twitterapi";
import { DEFAULT_WINDOW_DAYS, postProcess, writePosts, type SyncOptions, type SyncResult } from "./sync";
import type { MappedPost, RawTweet } from "./map";

/**
 * Sync for an extra account read through twitterapi.io (no X API keys for it). Same pipeline as the
 * X sync - fetch everything first, then write posts and one snapshot per post in one transaction,
 * then derive - so every analysis works the same. Differences: only public metrics (impressions =
 * viewCount; no profile visits, link clicks or video retention), and twitterapi.io bills every re-read,
 * so an incremental run does not page through the timeline:
 *  - discovery: a search for the account's tweets since the last run (one request, about $0.00015 when
 *    nothing is new);
 *  - refresh: the stored original posts from the window, re-read by id (50 per request, $0.00015 each).
 * full (or an empty database): the whole timeline with replies, 20 per page (up to ~3,200 tweets).
 */
const PAGE_LIMIT = 160;
const SEARCH_OVERLAP_SECONDS = 600;

interface TimelineResponse { status?: string; msg?: string; data?: { tweets?: TwitterApiTweet[] }; has_next_page?: boolean; next_cursor?: string }
interface SearchResponse { status?: string; msg?: string; tweets?: TwitterApiTweet[]; has_next_page?: boolean; next_cursor?: string }
interface TweetsResponse { status?: string; msg?: string; tweets?: TwitterApiTweet[] }
interface UserResponse {
  status?: string; msg?: string;
  data?: TwitterApiUser & { followers?: number; following?: number; statusesCount?: number; mediaCount?: number; favouritesCount?: number; unavailable?: boolean; unavailableReason?: string };
}

const num = (v: unknown): number | null => (typeof v === "number" && Number.isFinite(v) ? v : null);
const INTERNAL_LINK = /^https?:\/\/(www\.)?(x|twitter)\.com\//i;

/** twitterapi.io tweet -> the row shape the X sync writes. Private metrics stay null ("unavailable"), never 0. */
export function mapTwitterApiTweet(t: TwitterApiTweet, me: { id: string; username: string }): MappedPost {
  const kind: PostKind = t.retweeted_tweet ? "repost" : t.isReply && t.inReplyToId ? "reply" : t.quoted_tweet ? "quote" : "post";
  const referenced = kind === "repost" ? t.retweeted_tweet?.id : kind === "reply" ? t.inReplyToId : kind === "quote" ? t.quoted_tweet?.id : null;
  const media = t.extendedEntities?.media ?? t.extended_entities?.media ?? t.entities?.media ?? [];
  const mediaTypes = [...new Set(media.map((m) => m.type).filter((x): x is string => !!x))];
  const video = media.find((m) => m.type === "video" || m.type === "animated_gif");
  const external = [...new Set((t.entities?.urls ?? []).map((u) => u.expanded_url).filter((u): u is string => !!u && !INTERNAL_LINK.test(u)))];
  const metrics: MetricValues = {
    impressions: num(t.viewCount), likes: num(t.likeCount), replies: num(t.replyCount), reposts: num(t.retweetCount),
    quotes: num(t.quoteCount), bookmarks: num(t.bookmarkCount),
    profile_visits: null, link_clicks: null, engagements_reported: null, organic_impressions: null, video_views: null,
    playback_0: null, playback_25: null, playback_50: null, playback_75: null, playback_100: null,
  };
  // A repost's counters describe the original post, not this account's repost.
  if (kind === "repost") metrics.impressions = metrics.likes = metrics.replies = metrics.reposts = metrics.quotes = metrics.bookmarks = null;
  const quotedUrl = t.quoted_tweet ? `/${me.username.toLowerCase()}/status/${t.quoted_tweet.id}` : "";
  // X Articles are stored like the X sync stores them (article_title set), so they stay out of the analysed set.
  const article = t.article?.title ? t.article : null;
  const text = article ? [article.title, article.preview_text].filter(Boolean).join("\n\n") : t.text ?? "";
  return {
    x_id: t.id,
    url: `https://x.com/${me.username}/status/${t.id}`,
    text,
    short_text: t.text ?? "",
    article_title: article?.title ?? null,
    created_at: new Date(Date.parse(t.createdAt ?? "")).toISOString(),
    kind,
    is_self_reply: kind === "reply" && (t.inReplyToUserId === me.id || t.inReplyToUsername?.toLowerCase() === me.username.toLowerCase()),
    is_self_quote: kind === "quote" && (t.quoted_tweet?.author?.id === me.id || (!!quotedUrl && (t.quoted_tweet?.url ?? "").toLowerCase().includes(quotedUrl))),
    quoted_is_article: false,
    referenced_id: referenced ?? null,
    conversation_id: t.conversationId || null,
    in_reply_to_user_id: t.inReplyToUserId || null,
    lang: t.lang || null,
    has_media: media.length > 0,
    has_link: external.length > 0,
    media_types: mediaTypes,
    video_duration_ms: num(video?.video_info?.duration_millis),
    media_preview: media.map((m) => m.media_url_https).find((u): u is string => !!u) ?? article?.cover_media_img_url ?? null,
    external_urls: external,
    metrics,
    non_public_available: false,
    // Stored as raw_json for reference; quoted / retweeted copies are dropped to keep rows small.
    raw: { ...t, quoted_tweet: t.quoted_tweet ? { id: t.quoted_tweet.id } : null, retweeted_tweet: t.retweeted_tweet ? { id: t.retweeted_tweet.id } : null } as unknown as RawTweet,
  };
}

export async function runTwitterApiSync(opts: SyncOptions = {}): Promise<SyncResult> {
  const acc = currentAccount();
  if (!acc.username) throw new Error("This account has no handle configured.");
  const db = getDb();
  const log = opts.log ?? (() => {});
  const startedAt = new Date().toISOString();
  const existing = (db.prepare("SELECT COUNT(*) AS n FROM posts").get() as { n: number }).n;
  const mode: "incremental" | "full" = opts.mode === "full" || existing === 0 ? "full" : "incremental";
  const days = Math.max(1, opts.days ?? DEFAULT_WINDOW_DAYS);
  const windowStart = mode === "full" ? null : new Date(Date.now() - days * 86400000).toISOString();
  const runId = Number(db.prepare("INSERT INTO sync_runs (started_at, mode, status, window_start) VALUES (?, ?, 'running', ?)").run(startedAt, mode, windowStart).lastInsertRowid);
  const warnings: string[] = [];
  let requests = 0;
  const get = <T extends { status?: string; msg?: string }>(path: string, params: Record<string, string>) => { requests++; return twitterApiGet<T>(path, params); };

  try {
    /* ---------- 1. fetch ---------- */
    const user = (await get<UserResponse>("/twitter/user/info", { userName: acc.username })).data;
    if (!user?.id || user.unavailable) throw new Error(`@${acc.username} is not available on X${user?.unavailableReason ? ` (${user.unavailableReason})` : ""}.`);
    const me = { id: user.id, username: user.userName ?? acc.username };
    log(`profile @${me.username} via twitterapi.io`);
    const tweets = new Map<string, TwitterApiTweet>();
    const keep = (list: TwitterApiTweet[] | undefined) => {
      for (const t of list ?? []) if (t?.id && t.author?.id === me.id && !Number.isNaN(Date.parse(t.createdAt ?? ""))) tweets.set(t.id, t);
    };
    let complete = true;
    if (mode === "full") {
      let cursor = "", pages = 0;
      for (; pages < PAGE_LIMIT; pages++) {
        const page = await get<TimelineResponse>("/twitter/user/last_tweets", { userId: me.id, includeReplies: "true", cursor });
        const list = page.data?.tweets ?? [];
        keep(list);
        if (!list.length || !page.has_next_page || !page.next_cursor) break;
        cursor = page.next_cursor;
      }
      if (pages >= PAGE_LIMIT) { complete = false; warnings.push(`Timeline stopped at ${PAGE_LIMIT} pages; older posts were not fetched.`); }
      log(`timeline: ${tweets.size} tweets in ${requests - 1} request(s)`);
    } else {
      // Discovery: anything posted since the last run (with an overlap), from a single cheap search.
      const last = getMeta("twitterapi_last_search");
      const since = Math.floor((last ? Date.parse(last) : Date.parse(windowStart!)) / 1000) - SEARCH_OVERLAP_SECONDS;
      let cursor = "";
      for (let page = 0; page < 10; page++) {
        const r = await get<SearchResponse>("/twitter/tweet/advanced_search", { query: `from:${me.username} since_time:${since}`, queryType: "Latest", cursor });
        keep(r.tweets);
        if (!r.tweets?.length || !r.has_next_page || !r.next_cursor) break;
        cursor = r.next_cursor;
      }
      // Refresh: the stored original posts of the window that the search did not just return.
      const ids = (db.prepare("SELECT x_id FROM posts WHERE created_at >= ? AND kind IN ('post','quote')").all(windowStart) as { x_id: string }[])
        .map((r) => r.x_id).filter((id) => !tweets.has(id));
      for (let i = 0; i < ids.length; i += 50) keep((await get<TweetsResponse>("/twitter/tweets", { tweet_ids: ids.slice(i, i + 50).join(",") })).tweets);
      log(`discovery + refresh: ${tweets.size} tweets in ${requests - 1} request(s)`);
    }
    const mapped = [...tweets.values()].map((t) => mapTwitterApiTweet(t, me));

    /* ---------- 2. write ---------- */
    const capturedAt = new Date().toISOString();
    const out = db.transaction(() => writePosts(mapped, capturedAt, runId, "api"))();
    db.prepare(
      `INSERT OR IGNORE INTO account_snapshots (captured_at, source, followers, following, post_count, listed, likes_given, media_count)
       VALUES (?, 'twitterapi', ?, ?, ?, NULL, ?, ?)`
    ).run(capturedAt, num(user.followers), num(user.following), num(user.statusesCount), num(user.favouritesCount), num(user.mediaCount));
    if (mode === "full" && complete) {
      // Flag (never delete) stored posts the full timeline no longer returns.
      const seen = new Set(mapped.map((m) => m.x_id));
      const mark = db.prepare("UPDATE posts SET missing_since = ? WHERE id = ?");
      for (const c of db.prepare("SELECT id, x_id, missing_since FROM posts").all() as { id: number; x_id: string; missing_since: string | null }[]) {
        if (!seen.has(c.x_id)) { if (!c.missing_since) mark.run(capturedAt, c.id); } else if (c.missing_since) mark.run(null, c.id);
      }
    }

    /* ---------- 3. derive ---------- */
    postProcess();
    refreshCapabilities(capturedAt);
    setMeta("account_id", me.id);
    setMeta("account_username", me.username);
    setMeta("account_name", user.name ?? null);
    setMeta("account_avatar", user.profilePicture ?? null);
    setMeta("account_source", "twitterapi");
    setMeta("twitterapi_last_search", startedAt);
    setMeta("last_successful_sync", capturedAt);
    if (mode === "full") setMeta("last_full_sync", capturedAt);
    db.prepare(
      `UPDATE sync_runs SET finished_at = ?, status = 'ok', posts_fetched = ?, posts_inserted = ?, posts_updated = ?,
       snapshots_saved = ?, api_requests = ?, warnings = ? WHERE id = ?`
    ).run(new Date().toISOString(), mapped.length, out.inserted, out.updated, out.snapshots, requests, JSON.stringify(warnings), runId);
    return {
      runId, mode, windowStart, fetched: mapped.length, inserted: out.inserted, updated: out.updated, snapshots: out.snapshots,
      apiRequests: requests, warnings, account: { username: me.username, followers: num(user.followers) }, newPostIds: out.newIds,
    };
  } catch (err) {
    const message = redact(err instanceof Error ? err.message : String(err));
    db.prepare("UPDATE sync_runs SET finished_at = ?, status = 'error', error = ?, api_requests = ? WHERE id = ?").run(new Date().toISOString(), message, requests, runId);
    throw new Error(message);
  }
}
