import { getDb } from "../db";

/**
 * Manual format (series) for one post. Only a changed value becomes manual, so saving the same
 * value does not freeze the automatic one. Manual values are never overwritten by sync or rules.
 */
export function saveSeries(postId: number, series: string | null): boolean {
  const db = getDb();
  if (!db.prepare("SELECT 1 FROM posts WHERE id = ?").get(postId)) return false;
  const v = series && series.trim() ? series.trim() : null;
  db.prepare("UPDATE posts SET series = ?, series_source = 'manual' WHERE id = ? AND series IS NOT ?").run(v, postId, v);
  return true;
}

/** Hands the post's format back to the rule-based detection (used by "reset to automatic"). */
export function resetSeries(postId: number): void {
  getDb().prepare("UPDATE posts SET series_source = NULL WHERE id = ?").run(postId);
}
