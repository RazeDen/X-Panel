import { getDb, type CapabilityRow } from "./db";

/**
 * Capability report: which metrics X actually returns for this account.
 * It is rebuilt from the database after every sync, so it reflects observed data
 * rather than documentation. "not_offered" entries are metrics the X API v2 has no
 * field for at all - they are listed so the gap is explicit.
 */
interface Probe { key: string; label: string; column: string; source: string; note?: string; scope?: "video" | "link" }

const PROBES: Probe[] = [
  { key: "impressions", label: "Impressions / views", column: "impressions", source: "public_metrics.impression_count" },
  { key: "likes", label: "Likes", column: "likes", source: "public_metrics.like_count" },
  { key: "replies", label: "Replies", column: "replies", source: "public_metrics.reply_count" },
  { key: "reposts", label: "Reposts", column: "reposts", source: "public_metrics.retweet_count" },
  { key: "quotes", label: "Quotes", column: "quotes", source: "public_metrics.quote_count" },
  { key: "bookmarks", label: "Bookmarks", column: "bookmarks", source: "public_metrics.bookmark_count" },
  { key: "profile_visits", label: "Profile visits", column: "profile_visits", source: "non_public_metrics.user_profile_clicks", note: "Clicks on your name/avatar from the post. Private metric: needs user-context auth." },
  { key: "link_clicks", label: "Link clicks", column: "link_clicks", source: "non_public_metrics.url_link_clicks", scope: "link", note: "Only reported for posts that contain a clickable link/card; otherwise the field is absent (stored as NULL, not 0)." },
  { key: "engagements_reported", label: "Engagements (X-reported total)", column: "engagements_reported", source: "non_public_metrics.engagements", note: "X's own total, which also counts detail expands, media clicks and other interactions that are not broken out." },
  { key: "organic_impressions", label: "Organic impressions", column: "organic_impressions", source: "organic_metrics.impression_count" },
  { key: "video_views", label: "Video views", column: "video_views", source: "media.public_metrics.view_count", scope: "video" },
  { key: "video_quartiles", label: "Video playback quartiles (0/25/50/75/100%)", column: "playback_0", source: "media.non_public_metrics.playback_*_count", scope: "video", note: "Number of plays that reached each quarter of the clip. Used for the completion rate." },
];

const NOT_OFFERED: Omit<CapabilityRow, "checked_at">[] = [
  { key: "watch_time", label: "Watch time", status: "not_offered", source: null, note: "The X API v2 has no watch-time field. Playback quartiles are the closest available signal.", posts_with_value: null, posts_checked: null },
  { key: "media_engagements", label: "Media engagements / detail expands", status: "not_offered", source: null, note: "Not broken out by the API; they are included inside the X-reported engagements total.", posts_with_value: null, posts_checked: null },
  { key: "followers_from_post", label: "Followers gained from a post", status: "not_offered", source: null, note: "Not available per post. Account-level follower count is recorded at every sync instead.", posts_with_value: null, posts_checked: null },
  { key: "promoted_metrics", label: "Promoted (ads) metrics", status: "not_offered", source: "promoted_metrics.*", note: "Only exists for promoted posts; not requested.", posts_with_value: null, posts_checked: null },
];

export function refreshCapabilities(now: string = new Date().toISOString()): CapabilityRow[] {
  const db = getDb();
  const rows: CapabilityRow[] = [];
  for (const p of PROBES) {
    const scopeSql = p.scope === "video" ? "AND media_types LIKE '%video%'" : p.scope === "link" ? "AND has_link = 1" : "";
    const r = db.prepare(
      `SELECT COUNT(*) AS n, SUM(CASE WHEN ${p.column} IS NOT NULL THEN 1 ELSE 0 END) AS have FROM posts WHERE kind != 'repost' ${scopeSql}`
    ).get() as { n: number; have: number | null };
    const have = r.have ?? 0;
    const status: CapabilityRow["status"] = r.n === 0 ? "unavailable" : have === 0 ? "unavailable" : have >= r.n ? "available" : "partial";
    let note = p.note ?? null;
    if (r.n === 0 && p.scope) note = `${note ? note + " " : ""}No ${p.scope === "video" ? "video posts" : "posts with links"} in the database yet, so this could not be verified.`;
    if (status === "partial" && p.scope !== "link") note = `${note ? note + " " : ""}Missing on older posts: X serves private metrics only for roughly the last 30 days, and they were not collected before tracking started.`;
    rows.push({ key: p.key, label: p.label, status, source: p.source, note, posts_with_value: have, posts_checked: r.n, checked_at: now });
  }
  for (const n of NOT_OFFERED) rows.push({ ...n, checked_at: now });
  const up = db.prepare(
    `INSERT INTO capabilities (key, label, status, source, note, posts_with_value, posts_checked, checked_at)
     VALUES (@key, @label, @status, @source, @note, @posts_with_value, @posts_checked, @checked_at)
     ON CONFLICT(key) DO UPDATE SET label=excluded.label, status=excluded.status, source=excluded.source, note=excluded.note,
       posts_with_value=excluded.posts_with_value, posts_checked=excluded.posts_checked, checked_at=excluded.checked_at`
  );
  db.transaction(() => rows.forEach((r) => up.run(r)))();
  return rows;
}

export function getCapabilities(): CapabilityRow[] {
  return getDb().prepare("SELECT * FROM capabilities").all() as CapabilityRow[];
}
