import { quantile } from "../stats";
import type { Post } from "./types";

/**
 * Early growth: how many impressions a post had at a given age (1h, 6h, 24h ...), and how it
 * ranks against other posts at the same age - the YouTube "first N hours" comparison.
 *
 * Values come only from stored snapshots (one per sync):
 *  - a snapshot taken close to the target age is used as measured;
 *  - otherwise the value is interpolated linearly between the two snapshots around the target age,
 *    but only when they are close together (gap <= max(30 min, 35% of the age)). The moment of
 *    publishing counts as a point with 0 impressions. Interpolated values are flagged "estimated";
 *  - with no snapshots near that age the value is null ("not captured"), never a guess.
 * Frequent syncs right after posting (the scheduled 15-minute sync) are what make these numbers exist.
 */
export interface SnapPoint { capturedAt: string; impressions: number | null }
export interface AgeValue {
  value: number;
  /** Age in hours of the snapshot used (measured) or the target age (estimated). */
  atHours: number;
  estimated: boolean;
}

export const MILESTONES = [1, 6, 24] as const;
export type Status = "above" | "typical" | "below";
/** Minimum number of comparison posts before a status or same-age rank is shown. */
export const MIN_COMPARE = 3;

export function impressionsAtAge(createdAt: string, snaps: SnapPoint[], hours: number): AgeValue | null {
  const t0 = Date.parse(createdAt);
  const pts = snaps
    .filter((s) => s.impressions !== null)
    .map((s) => ({ h: (Date.parse(s.capturedAt) - t0) / 3600000, v: s.impressions as number }))
    .filter((p) => p.h >= 0)
    .sort((a, b) => a.h - b.h);
  if (!pts.length) return null;
  const tolerance = Math.max(0.125, hours * 0.1);
  const nearest = pts.reduce((best, p) => (Math.abs(p.h - hours) < Math.abs(best.h - hours) ? p : best));
  if (Math.abs(nearest.h - hours) <= tolerance) return { value: nearest.v, atHours: nearest.h, estimated: false };
  const before = [{ h: 0, v: 0 }, ...pts].filter((p) => p.h < hours).pop()!;
  const after = pts.find((p) => p.h > hours);
  if (!after || after.h - before.h > Math.max(0.5, hours * 0.35)) return null;
  const v = before.v + ((after.v - before.v) * (hours - before.h)) / (after.h - before.h);
  return { value: Math.round(v), atHours: hours, estimated: true };
}

/** Where a value sits against a reference set: above its 75th percentile, below its 25th, or in between. */
export function statusOf(value: number | null | undefined, reference: (number | null)[]): { status: Status; n: number; low: number; high: number } | null {
  const ref = reference.filter((v): v is number => typeof v === "number" && Number.isFinite(v));
  if (value === null || value === undefined || ref.length < MIN_COMPARE) return null;
  const low = quantile(ref, 0.25) as number, high = quantile(ref, 0.75) as number;
  return { status: value > high ? "above" : value < low ? "below" : "typical", n: ref.length, low, high };
}

export interface MilestoneRow {
  hours: number;
  value: AgeValue | null;
  /** Same-age values of the comparison posts. */
  others: number[];
  median: number | null;
  status: ReturnType<typeof statusOf>;
}

/** Impressions at 1h / 6h / 24h for one post, against the other posts at the same ages. */
export function milestones(post: Post, snaps: Map<number, SnapPoint[]>, comparison: Post[]): MilestoneRow[] {
  return MILESTONES.map((h) => {
    const value = impressionsAtAge(post.created_at, snaps.get(post.id) ?? [], h);
    const others = comparison
      .filter((p) => p.id !== post.id)
      .map((p) => impressionsAtAge(p.created_at, snaps.get(p.id) ?? [], h)?.value ?? null)
      .filter((v): v is number => v !== null);
    return { hours: h, value, others, median: others.length ? (quantile(others, 0.5) as number) : null, status: statusOf(value?.value, others) };
  });
}

export interface RecentCard {
  post: Post;
  index: number; // 0 = newest
  total: number;
  ageHours: number;
  rank: { rank: number; of: number; sameAge: boolean } | null;
  impressions: { value: number | null; status: ReturnType<typeof statusOf>; basis: string };
  firstHour: { value: AgeValue | null; status: ReturnType<typeof statusOf> };
  engagementRate: { value: number | null; status: ReturnType<typeof statusOf> };
  bookmarkRate: { value: number | null; status: ReturnType<typeof statusOf> };
}

/**
 * The YouTube-style "latest content" card for one of the last `count` original posts.
 * Rank: among the last `count` posts at this post's current age when at least MIN_COMPARE older posts
 * have a same-age value; otherwise by total impressions, labelled as such (posts of different ages).
 * Rates are compared with the other recent posts' lifetime rates (rates change little with age).
 */
export function recentCard(originals: Post[], snaps: Map<number, SnapPoint[]>, index: number, count = 10): RecentCard | null {
  const recent = [...originals].sort((a, b) => b.created_at.localeCompare(a.created_at)).slice(0, count);
  const post = recent[index];
  if (!post) return null;
  const others = recent.filter((p) => p.id !== post.id);
  const age = post.ageHours;

  // Same-age impressions of the older posts in the recent set.
  const sameAge = others
    .filter((p) => p.ageHours >= age)
    .map((p) => ({ id: p.id, v: impressionsAtAge(p.created_at, snaps.get(p.id) ?? [], age)?.value ?? null }))
    .filter((x): x is { id: number; v: number } => x.v !== null);
  let rank: RecentCard["rank"] = null;
  let impStatus: ReturnType<typeof statusOf> = null;
  let basis: string;
  if (post.impressions !== null && sameAge.length >= MIN_COMPARE) {
    rank = { rank: 1 + sameAge.filter((x) => x.v > (post.impressions as number)).length, of: sameAge.length + 1, sameAge: true };
    impStatus = statusOf(post.impressions, sameAge.map((x) => x.v));
    basis = `vs ${sameAge.length} recent posts at the same age`;
  } else {
    const lifetime = recent.filter((p) => p.impressions !== null);
    if (post.impressions !== null && lifetime.length >= MIN_COMPARE) {
      rank = { rank: 1 + lifetime.filter((p) => (p.impressions as number) > (post.impressions as number)).length, of: lifetime.length, sameAge: false };
    }
    // A post that is still growing cannot be judged against finished totals.
    impStatus = post.maturing ? null : statusOf(post.impressions, others.map((p) => p.impressions));
    basis = post.maturing ? "still growing - no same-age data for older posts yet" : `vs total impressions of ${others.length} recent posts`;
  }
  const firstHour = impressionsAtAge(post.created_at, snaps.get(post.id) ?? [], 1);
  const othersFirstHour = others.map((p) => impressionsAtAge(p.created_at, snaps.get(p.id) ?? [], 1)?.value ?? null);
  return {
    post, index, total: recent.length, ageHours: age, rank,
    impressions: { value: post.impressions, status: impStatus, basis },
    firstHour: { value: firstHour, status: statusOf(firstHour?.value, othersFirstHour) },
    engagementRate: { value: post.engagement_rate, status: statusOf(post.engagement_rate, others.map((p) => p.engagement_rate)) },
    bookmarkRate: { value: post.bookmark_rate, status: statusOf(post.bookmark_rate, others.map((p) => p.bookmark_rate)) },
  };
}

/** "First 9 days 1 hour" style age label. */
export function ageLabel(hours: number): string {
  const h = Math.max(0, Math.floor(hours));
  if (h < 1) return `First ${Math.max(1, Math.round(hours * 60))} min`;
  const d = Math.floor(h / 24), r = h % 24;
  const part = (n: number, w: string) => `${n} ${w}${n === 1 ? "" : "s"}`;
  return `First ${d ? part(d, "day") + (r ? " " + part(r, "hour") : "") : part(r, "hour")}`;
}
