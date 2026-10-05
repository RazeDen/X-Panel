import { median, sum } from "../stats";
import { addDays, daysBetween, shortDate, weekOfDate } from "../time";
import type { Post } from "./types";

export interface SeriesPoint {
  label: string;
  start: string;
  end: string;
  href: string;
  posts: number;
  impressions: number | null;
  engagementRate: number | null; // median of per-post engagement rates
  note: string;
}
export type Granularity = "day" | "week" | "month";

/**
 * Buckets posts by PUBLISH date. The X API does not expose account impressions per
 * day, so "impressions over time" here means: impressions (to date) earned by the
 * posts published in each period.
 */
export function buildSeries(posts: Post[], start: string, end: string): { points: SeriesPoint[]; granularity: Granularity } {
  const span = daysBetween(start, end) + 1;
  const granularity: Granularity = span <= 45 ? "day" : span <= 200 ? "week" : "month";
  const buckets: { label: string; start: string; end: string; href: string }[] = [];
  if (granularity === "day") {
    for (let d = start; d <= end; d = addDays(d, 1)) buckets.push({ label: shortDate(d), start: d, end: d, href: `/posts?from=${d}&to=${d}` });
  } else if (granularity === "week") {
    for (let w = weekOfDate(start); w.start <= end; w = weekOfDate(addDays(w.start, 7))) {
      buckets.push({ label: shortDate(w.start), start: w.start, end: w.end, href: `/posts?week=${w.key}` });
    }
  } else {
    let [y, m] = start.split("-").map(Number);
    const [ey, em] = end.split("-").map(Number);
    while (y < ey || (y === ey && m <= em)) {
      const first = `${y}-${String(m).padStart(2, "0")}-01`;
      const next = m === 12 ? `${y + 1}-01-01` : `${y}-${String(m + 1).padStart(2, "0")}-01`;
      const last = addDays(next, -1);
      buckets.push({ label: `${["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"][m - 1]} ${String(y).slice(2)}`, start: first, end: last, href: `/posts?from=${first}&to=${last}` });
      if (m === 12) { y++; m = 1; } else m++;
    }
  }
  const points = buckets.map((b) => {
    const ps = posts.filter((p) => p.localDate >= b.start && p.localDate <= b.end);
    return {
      ...b,
      posts: ps.length,
      impressions: ps.length ? sum(ps.map((p) => p.impressions)) : null,
      engagementRate: median(ps.map((p) => p.engagement_rate)),
      note: `${ps.length} post${ps.length === 1 ? "" : "s"} published`,
    };
  });
  return { points, granularity };
}
