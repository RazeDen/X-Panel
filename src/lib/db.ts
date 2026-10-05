import Database from "better-sqlite3";
import fs from "node:fs";
import path from "node:path";

/**
 * SQLite persistence. One file: data/analytics.db (override with ANALYTICS_DB).
 * Migrations are plain SQL, applied in order and recorded in schema_migrations.
 * Nothing in this project ever deletes posts or snapshots.
 */
export function dbPath(): string {
  return path.resolve(/*turbopackIgnore: true*/ process.cwd(), process.env.ANALYTICS_DB || "data/analytics.db");
}

const MIGRATIONS: { id: number; name: string; sql: string }[] = [
  {
    id: 1,
    name: "initial schema",
    sql: `
CREATE TABLE posts (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  x_id TEXT NOT NULL UNIQUE,
  url TEXT NOT NULL,
  text TEXT NOT NULL,                 -- full text (long-post body or article text when available)
  short_text TEXT,                    -- the 'text' field exactly as returned by the API
  article_title TEXT,
  created_at TEXT NOT NULL,           -- UTC ISO 8601
  first_seen_at TEXT NOT NULL,
  last_synced_at TEXT NOT NULL,
  missing_since TEXT,                 -- set when a sync covering this post's date no longer returns it

  -- structure
  kind TEXT NOT NULL,                 -- post | quote | reply | repost
  is_self_reply INTEGER NOT NULL DEFAULT 0,
  is_thread_root INTEGER NOT NULL DEFAULT 0,
  is_self_quote INTEGER NOT NULL DEFAULT 0,
  quoted_is_article INTEGER NOT NULL DEFAULT 0,
  referenced_id TEXT,
  conversation_id TEXT,
  in_reply_to_user_id TEXT,
  lang TEXT,
  has_media INTEGER NOT NULL DEFAULT 0,
  has_link INTEGER NOT NULL DEFAULT 0,
  media_types TEXT,                   -- JSON array, e.g. ["video"]
  video_duration_ms INTEGER,
  external_urls TEXT,                 -- JSON array

  -- classification (editable)
  topic TEXT,
  subtopic TEXT,
  content_type TEXT,
  hook_type TEXT,
  is_news INTEGER,
  class_source TEXT,                  -- manual | ai | rule
  class_updated_at TEXT,
  class_note TEXT,
  format TEXT,
  format_source TEXT,                 -- rule | manual

  -- latest metrics (NULL = not available from the API, never 0)
  impressions INTEGER,
  likes INTEGER,
  replies INTEGER,
  reposts INTEGER,
  quotes INTEGER,
  bookmarks INTEGER,
  profile_visits INTEGER,
  link_clicks INTEGER,
  engagements_reported INTEGER,
  organic_impressions INTEGER,
  video_views INTEGER,
  playback_0 INTEGER,
  playback_25 INTEGER,
  playback_50 INTEGER,
  playback_75 INTEGER,
  playback_100 INTEGER,
  non_public_available INTEGER NOT NULL DEFAULT 0,

  -- derived rates (NULL when the inputs are unavailable or impressions = 0)
  like_rate REAL,
  reply_rate REAL,
  repost_rate REAL,
  quote_rate REAL,
  bookmark_rate REAL,
  engagement_rate REAL,
  profile_visit_rate REAL,
  link_click_rate REAL,
  video_view_rate REAL,
  video_completion_rate REAL,

  raw_json TEXT
);
CREATE INDEX idx_posts_created ON posts(created_at);
CREATE INDEX idx_posts_kind ON posts(kind);

CREATE TABLE sync_runs (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  started_at TEXT NOT NULL,
  finished_at TEXT,
  mode TEXT NOT NULL,                 -- incremental | full | legacy-import
  status TEXT NOT NULL,               -- running | ok | error
  window_start TEXT,
  posts_fetched INTEGER,
  posts_inserted INTEGER,
  posts_updated INTEGER,
  snapshots_saved INTEGER,
  api_requests INTEGER,
  warnings TEXT,                      -- JSON array of strings
  error TEXT
);

CREATE TABLE metric_snapshots (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  post_id INTEGER NOT NULL REFERENCES posts(id),
  sync_run_id INTEGER REFERENCES sync_runs(id),
  captured_at TEXT NOT NULL,
  source TEXT NOT NULL DEFAULT 'api', -- api | legacy-import
  impressions INTEGER,
  likes INTEGER,
  replies INTEGER,
  reposts INTEGER,
  quotes INTEGER,
  bookmarks INTEGER,
  profile_visits INTEGER,
  link_clicks INTEGER,
  engagements_reported INTEGER,
  organic_impressions INTEGER,
  video_views INTEGER,
  playback_0 INTEGER,
  playback_25 INTEGER,
  playback_50 INTEGER,
  playback_75 INTEGER,
  playback_100 INTEGER,
  UNIQUE (post_id, captured_at)
);
CREATE INDEX idx_snap_post ON metric_snapshots(post_id, captured_at);

CREATE TABLE account_snapshots (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  captured_at TEXT NOT NULL UNIQUE,
  source TEXT NOT NULL DEFAULT 'api',
  followers INTEGER,
  following INTEGER,
  post_count INTEGER,
  listed INTEGER,
  likes_given INTEGER,
  media_count INTEGER
);

CREATE TABLE capabilities (
  key TEXT PRIMARY KEY,
  label TEXT NOT NULL,
  status TEXT NOT NULL,               -- available | partial | unavailable | not_offered
  source TEXT,
  note TEXT,
  posts_with_value INTEGER,
  posts_checked INTEGER,
  checked_at TEXT NOT NULL
);

CREATE TABLE weekly_reports (
  week_key TEXT PRIMARY KEY,          -- 2026-W40
  start_date TEXT NOT NULL,
  end_date TEXT NOT NULL,
  generated_at TEXT NOT NULL,
  post_count INTEGER NOT NULL,
  data_json TEXT NOT NULL,            -- full deterministic report
  ai_analysis TEXT,                   -- optional written analysis
  ai_model TEXT
);

CREATE TABLE meta (
  key TEXT PRIMARY KEY,
  value TEXT
);
`,
  },
];

type DB = Database.Database;
const g = globalThis as unknown as { __xaDb?: { path: string; db: DB } };

export function getDb(): DB {
  const file = dbPath();
  if (g.__xaDb && g.__xaDb.path === file && g.__xaDb.db.open) return g.__xaDb.db;
  fs.mkdirSync(path.dirname(file), { recursive: true });
  const db = new Database(file);
  // DELETE journal keeps the database a single portable file (safe on synced / network folders).
  db.pragma("journal_mode = DELETE");
  db.pragma("foreign_keys = ON");
  db.pragma("busy_timeout = 5000");
  migrate(db);
  g.__xaDb = { path: file, db };
  return db;
}

export function migrate(db: DB): number[] {
  db.exec("CREATE TABLE IF NOT EXISTS schema_migrations (id INTEGER PRIMARY KEY, name TEXT NOT NULL, applied_at TEXT NOT NULL)");
  const done = new Set((db.prepare("SELECT id FROM schema_migrations").all() as { id: number }[]).map((r) => r.id));
  const applied: number[] = [];
  for (const m of MIGRATIONS) {
    if (done.has(m.id)) continue;
    db.transaction(() => {
      db.exec(m.sql);
      db.prepare("INSERT INTO schema_migrations (id, name, applied_at) VALUES (?, ?, ?)").run(m.id, m.name, new Date().toISOString());
    })();
    applied.push(m.id);
  }
  return applied;
}

export function getMeta(key: string): string | null {
  const row = getDb().prepare("SELECT value FROM meta WHERE key = ?").get(key) as { value: string | null } | undefined;
  return row?.value ?? null;
}
export function setMeta(key: string, value: string | null): void {
  getDb().prepare("INSERT INTO meta (key, value) VALUES (?, ?) ON CONFLICT(key) DO UPDATE SET value = excluded.value").run(key, value);
}

/* ---------- row types ---------- */

export interface MetricValues {
  impressions: number | null;
  likes: number | null;
  replies: number | null;
  reposts: number | null;
  quotes: number | null;
  bookmarks: number | null;
  profile_visits: number | null;
  link_clicks: number | null;
  engagements_reported: number | null;
  organic_impressions: number | null;
  video_views: number | null;
  playback_0: number | null;
  playback_25: number | null;
  playback_50: number | null;
  playback_75: number | null;
  playback_100: number | null;
}
export const METRIC_KEYS: (keyof MetricValues)[] = [
  "impressions", "likes", "replies", "reposts", "quotes", "bookmarks", "profile_visits", "link_clicks",
  "engagements_reported", "organic_impressions", "video_views", "playback_0", "playback_25", "playback_50", "playback_75", "playback_100",
];

export interface RateValues {
  like_rate: number | null;
  reply_rate: number | null;
  repost_rate: number | null;
  quote_rate: number | null;
  bookmark_rate: number | null;
  engagement_rate: number | null;
  profile_visit_rate: number | null;
  link_click_rate: number | null;
  video_view_rate: number | null;
  video_completion_rate: number | null;
}

export type PostKind = "post" | "quote" | "reply" | "repost";
export type ClassSource = "manual" | "ai" | "rule";

export interface PostRow extends MetricValues, RateValues {
  id: number;
  x_id: string;
  url: string;
  text: string;
  short_text: string | null;
  article_title: string | null;
  created_at: string;
  first_seen_at: string;
  last_synced_at: string;
  missing_since: string | null;
  kind: PostKind;
  is_self_reply: number;
  is_thread_root: number;
  is_self_quote: number;
  quoted_is_article: number;
  referenced_id: string | null;
  conversation_id: string | null;
  in_reply_to_user_id: string | null;
  lang: string | null;
  has_media: number;
  has_link: number;
  media_types: string | null;
  video_duration_ms: number | null;
  external_urls: string | null;
  topic: string | null;
  subtopic: string | null;
  content_type: string | null;
  hook_type: string | null;
  is_news: number | null;
  class_source: ClassSource | null;
  class_updated_at: string | null;
  class_note: string | null;
  format: string | null;
  format_source: "rule" | "manual" | null;
  non_public_available: number;
}

export interface SnapshotRow extends MetricValues {
  id: number;
  post_id: number;
  sync_run_id: number | null;
  captured_at: string;
  source: string;
}

export interface SyncRunRow {
  id: number;
  started_at: string;
  finished_at: string | null;
  mode: string;
  status: "running" | "ok" | "error";
  window_start: string | null;
  posts_fetched: number | null;
  posts_inserted: number | null;
  posts_updated: number | null;
  snapshots_saved: number | null;
  api_requests: number | null;
  warnings: string | null;
  error: string | null;
}

export interface AccountSnapshotRow {
  id: number;
  captured_at: string;
  source: string;
  followers: number | null;
  following: number | null;
  post_count: number | null;
  listed: number | null;
  likes_given: number | null;
  media_count: number | null;
}

export interface CapabilityRow {
  key: string;
  label: string;
  status: "available" | "partial" | "unavailable" | "not_offered";
  source: string | null;
  note: string | null;
  posts_with_value: number | null;
  posts_checked: number | null;
  checked_at: string;
}
