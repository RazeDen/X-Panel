import { getDb, type ClassSource } from "../db";
import type { Classification } from "./taxonomy";

/** Writes tags for one post. Empty strings become NULL; the source is always recorded. */
export function saveClassification(
  postId: number,
  c: Partial<Classification> & { format?: string | null },
  source: ClassSource,
  note?: string | null
): boolean {
  const db = getDb();
  const cur = db.prepare("SELECT id, topic, subtopic, content_type, hook_type, is_news, format FROM posts WHERE id = ?").get(postId) as
    | { id: number; topic: string | null; subtopic: string | null; content_type: string | null; hook_type: string | null; is_news: number | null; format: string | null }
    | undefined;
  if (!cur) return false;
  const norm = (v: string | null | undefined, fallback: string | null) => (v === undefined ? fallback : v && v.trim() ? v.trim() : null);
  const isNews = c.is_news === undefined ? cur.is_news : c.is_news === null ? null : c.is_news ? 1 : 0;
  db.prepare(
    `UPDATE posts SET topic = ?, subtopic = ?, content_type = ?, hook_type = ?, is_news = ?, class_source = ?, class_updated_at = ?, class_note = ? WHERE id = ?`
  ).run(norm(c.topic, cur.topic), norm(c.subtopic, cur.subtopic), norm(c.content_type, cur.content_type), norm(c.hook_type, cur.hook_type), isNews, source, new Date().toISOString(), note ?? null, postId);
  if (c.format !== undefined) {
    const f = c.format && c.format.trim() ? c.format.trim() : null;
    if (f && f !== cur.format) db.prepare("UPDATE posts SET format = ?, format_source = 'manual' WHERE id = ?").run(f, postId);
  }
  return true;
}

/** Hands a post back to the rule-based classifier (used by "reset to automatic"). */
export function resetClassification(postId: number): void {
  getDb().prepare("UPDATE posts SET class_source = NULL, format_source = NULL WHERE id = ?").run(postId);
}
