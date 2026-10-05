import { getDb, getMeta, type AccountSnapshotRow, type CapabilityRow, type PostRow, type SnapshotRow, type SyncRunRow } from "./db";
import { publicEngagements } from "./metrics";
import { bucketOfHour, localParts, weekOfDate } from "./time";
import { scorePosts } from "./analytics/scoring";
import { MATURITY_HOURS, type Post } from "./analytics/types";

/** Reads everything the dashboard needs in one pass. The data set is small (hundreds of posts). */
export interface Dataset {
  posts: Post[]; // every stored post, newest first
  originals: Post[]; // posts + quote posts: the set every analysis runs on
  account: { username: string | null; name: string | null };
  followers: AccountSnapshotRow[];
  lastSync: string | null;
  lastRun: SyncRunRow | null;
  runs: SyncRunRow[];
  capabilities: CapabilityRow[];
  snapshotCount: number;
  empty: boolean;
}

function parseArray(json: string | null): string[] {
  try {
    const v = JSON.parse(json ?? "[]");
    return Array.isArray(v) ? v : [];
  } catch {
    return [];
  }
}

export function toPost(r: PostRow): Post {
  const lp = localParts(r.created_at);
  const { media_types, external_urls, ...rest } = r;
  const ageHours = (Date.parse(r.last_synced_at) - Date.parse(r.created_at)) / 3600000;
  return {
    ...rest,
    mediaTypes: parseArray(media_types),
    externalUrls: parseArray(external_urls),
    localDate: lp.date,
    localTime: lp.time,
    hour: lp.hour,
    dow: lp.dow,
    dowName: lp.dowName,
    bucket: bucketOfHour(lp.hour),
    weekKey: weekOfDate(lp.date).key,
    engagements: publicEngagements(r),
    ageHours,
    maturing: ageHours < MATURITY_HOURS,
    isOriginal: r.kind === "post" || r.kind === "quote",
    score: null,
  };
}

const POST_COLUMNS = `id, x_id, url, text, short_text, article_title, created_at, first_seen_at, last_synced_at, missing_since,
  kind, is_self_reply, is_thread_root, is_self_quote, quoted_is_article, referenced_id, conversation_id, in_reply_to_user_id, lang,
  has_media, has_link, media_types, video_duration_ms, external_urls,
  topic, subtopic, content_type, hook_type, is_news, class_source, class_updated_at, class_note, format, format_source,
  impressions, likes, replies, reposts, quotes, bookmarks, profile_visits, link_clicks, engagements_reported, organic_impressions,
  video_views, playback_0, playback_25, playback_50, playback_75, playback_100, non_public_available,
  like_rate, reply_rate, repost_rate, quote_rate, bookmark_rate, engagement_rate, profile_visit_rate, link_click_rate,
  video_view_rate, video_completion_rate`;

export function loadPosts(): { posts: Post[]; originals: Post[] } {
  const rows = getDb().prepare(`SELECT ${POST_COLUMNS} FROM posts ORDER BY created_at DESC`).all() as PostRow[];
  const posts = rows.map(toPost);
  const originals = posts.filter((p) => p.isOriginal);
  scorePosts(originals);
  return { posts, originals };
}

export function getDataset(): Dataset {
  const db = getDb();
  const { posts, originals } = loadPosts();
  const runs = db.prepare("SELECT * FROM sync_runs ORDER BY id DESC LIMIT 30").all() as SyncRunRow[];
  return {
    posts,
    originals,
    account: { username: getMeta("account_username"), name: getMeta("account_name") },
    followers: db.prepare("SELECT * FROM account_snapshots ORDER BY captured_at").all() as AccountSnapshotRow[],
    lastSync: getMeta("last_successful_sync"),
    lastRun: runs.find((r) => r.mode !== "legacy-import") ?? null,
    runs,
    capabilities: db.prepare("SELECT * FROM capabilities").all() as CapabilityRow[],
    snapshotCount: (db.prepare("SELECT COUNT(*) AS n FROM metric_snapshots").get() as { n: number }).n,
    empty: posts.length === 0,
  };
}

export function getSnapshots(postId: number): SnapshotRow[] {
  return getDb().prepare("SELECT * FROM metric_snapshots WHERE post_id = ? ORDER BY captured_at").all(postId) as SnapshotRow[];
}

/** Distinct tag values currently in use, for filter menus and the tag editor. */
export function tagValues(posts: Post[]): Record<"topic" | "subtopic" | "content_type" | "hook_type" | "format", string[]> {
  const collect = (pick: (p: Post) => string | null) => [...new Set(posts.map(pick).filter((v): v is string => !!v))].sort((a, b) => a.localeCompare(b));
  return {
    topic: collect((p) => p.topic),
    subtopic: collect((p) => p.subtopic),
    content_type: collect((p) => p.content_type),
    hook_type: collect((p) => p.hook_type),
    format: collect((p) => p.format),
  };
}
