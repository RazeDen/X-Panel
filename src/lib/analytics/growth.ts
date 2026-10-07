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

/** Ages (hours) shown in "Early performance". The first hour is the one the owner tracks. */
export const MILESTONES = [1, 6, 24] as const;
export type Status = "above" | "typical" | "below";
/** Minimum number of comparison posts before a range status or same-age rank is shown. */
export const MIN_COMPARE = 3;

/** A verdict: range-based (p25-p75, from statusOf) or a plain above / below the median (from medianVerdict). */
export interface Verdict { status: Status; n: number; low: number; high: number; byMedian?: boolean }

/** "milestone" label: 0.25 -> "15 min", 1 -> "1 hour", 6 -> "6 hours". */
export function ageMark(hours: number): string {
  return hours < 1 ? `${Math.round(hours * 60)} min` : hours === 1 ? "1 hour" : `${hours} hours`;
}

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
export function statusOf(value: number | null | undefined, reference: (number | null)[]): Verdict | null {
  const ref = reference.filter((v): v is number => typeof v === "number" && Number.isFinite(v));
  if (value === null || value === undefined || ref.length < MIN_COMPARE) return null;
  const low = quantile(ref, 0.25) as number, high = quantile(ref, 0.75) as number;
  return { status: value > high ? "above" : value < low ? "below" : "typical", n: ref.length, low, high };
}

/**
 * Above or below the median of the comparison posts (owner's request for first-hour numbers:
 * an arrow up or down against the typical post). Shown from n = 1; n is always carried so the
 * UI can mark small samples.
 */
export function medianVerdict(value: number | null | undefined, reference: (number | null)[]): Verdict | null {
  const ref = reference.filter((v): v is number => typeof v === "number" && Number.isFinite(v));
  if (value === null || value === undefined || !ref.length) return null;
  const m = quantile(ref, 0.5) as number;
  return { status: value > m ? "above" : value < m ? "below" : "typical", n: ref.length, low: m, high: m, byMedian: true };
}

export interface MilestoneRow {
  hours: number;
  value: AgeValue | null;
  /** Same-age values of the comparison posts. */
  others: number[];
  median: number | null;
  status: Verdict | null;
}

/** Impressions at 1h / 6h / 24h for one post, against the other posts at the same ages. */
export function milestones(post: Post, snaps: Map<number, SnapPoint[]>, comparison: Post[]): MilestoneRow[] {
  return MILESTONES.map((h) => {
    const value = impressionsAtAge(post.created_at, snaps.get(post.id) ?? [], h);
    const others = comparison
      .filter((p) => p.id !== post.id)
      .map((p) => impressionsAtAge(p.created_at, snaps.get(p.id) ?? [], h)?.value ?? null)
      .filter((v): v is number => v !== null);
    return { hours: h, value, others, median: others.length ? (quantile(others, 0.5) as number) : null, status: medianVerdict(value?.value, others) };
  });
}

export interface RecentCard {
  post: Post;
  index: number; // 0 = newest
  total: number;
  ageHours: number;
  rank: { rank: number; of: number; sameAge: boolean } | null;
  impressions: { value: number | null; status: ReturnType<typeof statusOf>; basis: string };
  firstHour: { value: AgeValue | null; status: Verdict | null };
  /** First-hour impressions of the other recent posts (for the first-hour meter). */
  firstHourOthers: number[];
  /** Engagement rate against posts with similar impressions (see similarReach), not against all posts. */
  engagementRate: { value: number | null; status: Verdict | null; basis: string };
  bookmarkRate: { value: number | null; status: ReturnType<typeof statusOf> };
}

/**
 * Engagement rate falls as reach grows (a post that reaches people beyond the core audience gets a
 * lower share of interactions), so comparing a 10K-impression post with a 500-impression post is
 * unfair. similarReach picks the REACH_NEIGHBOURS posts whose impressions are closest on a log scale
 * (500 vs 1,000 counts as close as 5,000 vs 10,000) and the verdict is above / below their median ER.
 */
export const REACH_NEIGHBOURS = 15;
export function similarReach(post: Post, pool: Post[], k = REACH_NEIGHBOURS): Post[] {
  if (post.impressions === null || post.impressions <= 0) return [];
  const x = Math.log10(post.impressions);
  return pool
    .filter((p) => p.id !== post.id && p.impressions !== null && p.impressions > 0 && p.engagement_rate !== null)
    .sort((a, b) => Math.abs(Math.log10(a.impressions as number) - x) - Math.abs(Math.log10(b.impressions as number) - x))
    .slice(0, k);
}
export function erVsSimilarReach(post: Post, pool: Post[]): { value: number | null; status: Verdict | null; basis: string } {
  const peers = similarReach(post, pool);
  const imps = peers.map((p) => p.impressions as number);
  const range = imps.length ? `${Math.min(...imps).toLocaleString("en-US")}-${Math.max(...imps).toLocaleString("en-US")} impressions` : "";
  return {
    value: post.engagement_rate,
    status: peers.length >= MIN_COMPARE ? medianVerdict(post.engagement_rate, peers.map((p) => p.engagement_rate)) : null,
    basis: `your ${peers.length} posts with the most similar impressions (${range})`,
  };
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
  const at = (p: Post, h: number) => impressionsAtAge(p.created_at, snaps.get(p.id) ?? [], h);
  const firstHour = at(post, 1);
  const firstHourOthers = others.map((p) => at(p, 1)?.value ?? null).filter((v): v is number => v !== null);
  return {
    post, index, total: recent.length, ageHours: age, rank,
    impressions: { value: post.impressions, status: impStatus, basis },
    firstHour: { value: firstHour, status: medianVerdict(firstHour?.value, firstHourOthers) },
    firstHourOthers,
    engagementRate: erVsSimilarReach(post, originals),
    bookmarkRate: { value: post.bookmark_rate, status: statusOf(post.bookmark_rate, others.map((p) => p.bookmark_rate)) },
  };
}

/**
 * Ages (minutes after publishing) at which the auto sync takes a snapshot on time, so the 1h, 6h and
 * 24h values are measured (+/- 2.5 minutes) instead of interpolated (owner's choice, 2026-10-07).
 * The scheduled task runs every 5 minutes and only calls the API when one of these is due or the
 * regular 15-minute sync is.
 */
export const CAPTURE_MINUTES = [60, 360, 1440] as const;
export const CAPTURE_WINDOW_MIN = 2.5;

/** The first post (if any) that is within CAPTURE_WINDOW_MIN of a capture age and has no snapshot near it yet. */
export function captureDue(
  posts: { id: number; created_at: string }[],
  snaps: Map<number, SnapPoint[]>,
  nowMs: number
): { postId: number; minutes: number } | null {
  for (const p of posts) {
    const t0 = Date.parse(p.created_at);
    const age = (nowMs - t0) / 60000;
    for (const m of CAPTURE_MINUTES) {
      if (Math.abs(age - m) > CAPTURE_WINDOW_MIN) continue;
      const taken = (snaps.get(p.id) ?? []).some((s) => Math.abs((Date.parse(s.capturedAt) - t0) / 60000 - m) <= CAPTURE_WINDOW_MIN);
      if (!taken) return { postId: p.id, minutes: m };
    }
  }
  return null;
}

/** "First 9 days 1 hour" style age label. */
export function ageLabel(hours: number): string {
  const h = Math.max(0, Math.floor(hours));
  if (h < 1) return `First ${Math.max(1, Math.round(hours * 60))} min`;
  const d = Math.floor(h / 24), r = h % 24;
  const part = (n: number, w: string) => `${n} ${w}${n === 1 ? "" : "s"}`;
  return `First ${d ? part(d, "day") + (r ? " " + part(r, "hour") : "") : part(r, "hour")}`;
}
