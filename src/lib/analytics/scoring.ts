import { mad, median, percentileRank, quantile } from "../stats";
import type { OutlierKind, Post, PostScore, ScoreComponent } from "./types";

/**
 * Scores and outlier detection - all relative to this account's own history.
 *
 * Reference set
 *   For a post P the reference set is every other original post published in the
 *   90 days before P (no look-ahead). If that gives fewer than MIN_REFERENCE posts,
 *   all other original posts are used instead ("all-time"). With fewer than
 *   MIN_REFERENCE posts in total, nothing is scored.
 *
 * Distribution score (reach)
 *   Percentile rank of P's impressions inside the reference set (0-100).
 *   50 = a typical post, 90 = more reach than 90% of the reference posts.
 *
 * Engagement quality score (what people did once they saw it)
 *   For each available per-impression rate (likes, replies, reposts, bookmarks,
 *   profile visits) take P's percentile rank inside the reference set, then average
 *   those percentiles with equal weight. Rates that are unavailable are left out,
 *   not treated as zero. The components are always shown next to the score.
 *
 * Outliers
 *   Reach is heavy-tailed, so the test runs on log10(impressions + 1) and uses the
 *   median and the median absolute deviation (MAD) instead of mean / standard
 *   deviation - one viral post cannot move the baseline.
 *     robust z = 0.6745 * (x - median) / MAD
 *     z >= 3.5 -> "far above"   z >= 2 -> "above"   z <= -2 -> "below"
 *   The "expected range" shown in the UI is the 25th-75th percentile of the
 *   reference set. This describes what happened; it is not a prediction model.
 */
export const MIN_REFERENCE = 8;
export const REFERENCE_DAYS = 90;
export const Z_ABOVE = 2;
export const Z_FAR_ABOVE = 3.5;
export const Z_BELOW = -2;
export const LOW_CONFIDENCE_IMPRESSIONS = 200;

const QUALITY_RATES: { key: keyof Post; label: string }[] = [
  { key: "like_rate", label: "Like rate" },
  { key: "reply_rate", label: "Reply rate" },
  { key: "repost_rate", label: "Repost rate" },
  { key: "bookmark_rate", label: "Bookmark rate" },
  { key: "profile_visit_rate", label: "Profile visit rate" },
];

const log = (x: number) => Math.log10(x + 1);

export function scorePosts(originals: Post[]): void {
  const usable = originals.filter((p) => p.impressions !== null);
  for (const p of originals) {
    p.score = null;
    if (p.impressions === null) continue;
    const t = Date.parse(p.created_at);
    let reference = usable.filter((o) => {
      if (o.id === p.id) return false;
      const ot = Date.parse(o.created_at);
      return ot < t && ot >= t - REFERENCE_DAYS * 86400000;
    });
    let referenceKind: PostScore["referenceKind"] = "trailing-90d";
    if (reference.length < MIN_REFERENCE) {
      reference = usable.filter((o) => o.id !== p.id);
      referenceKind = "all-time";
    }
    if (reference.length < MIN_REFERENCE) continue;

    const refImp = reference.map((o) => o.impressions as number);
    const expectedMedian = median(refImp) as number;
    const distribution = percentileRank(refImp, p.impressions) as number;

    const logs = refImp.map(log);
    const m = median(logs) as number;
    const d = mad(logs) as number;
    const robustZ = d > 0 ? (0.6745 * (log(p.impressions) - m)) / d : null;
    let outlier: OutlierKind | null = null;
    if (robustZ !== null) {
      if (robustZ >= Z_FAR_ABOVE) outlier = "far_above";
      else if (robustZ >= Z_ABOVE) outlier = "above";
      else if (robustZ <= Z_BELOW) outlier = "below";
    }

    const qualityComponents: ScoreComponent[] = [];
    for (const r of QUALITY_RATES) {
      const value = p[r.key] as number | null;
      if (value === null) continue;
      const ref = reference.map((o) => o[r.key] as number | null).filter((v): v is number => v !== null);
      if (ref.length < MIN_REFERENCE) continue;
      qualityComponents.push({ key: String(r.key), label: r.label, value, percentile: percentileRank(ref, value) as number, referenceMedian: median(ref) });
    }
    const quality = qualityComponents.length ? qualityComponents.reduce((a, c) => a + c.percentile, 0) / qualityComponents.length : null;

    const score: PostScore = {
      referenceKind,
      referenceN: reference.length,
      expectedMedian,
      expectedLow: quantile(refImp, 0.25) as number,
      expectedHigh: quantile(refImp, 0.75) as number,
      distribution,
      quality,
      qualityComponents,
      lift: expectedMedian > 0 ? p.impressions / expectedMedian - 1 : 0,
      robustZ,
      outlier,
      lowConfidence: p.impressions < LOW_CONFIDENCE_IMPRESSIONS,
      diagnosis: "",
    };
    score.diagnosis = diagnose(score, p.maturing);
    p.score = score;
  }
}

/** Plain-language reading of the two scores. Describes, never explains why. */
export function diagnose(s: PostScore, maturing: boolean): string {
  const hiD = s.distribution >= 67, loD = s.distribution <= 33;
  const hiQ = s.quality !== null && s.quality >= 67, loQ = s.quality !== null && s.quality <= 33;
  let text: string;
  if (s.quality === null) text = hiD ? "High distribution relative to baseline." : loD ? "Low distribution relative to baseline." : "Distribution in line with baseline.";
  else if (hiD && hiQ) text = "High distribution and high engagement quality relative to baseline.";
  else if (hiD && loQ) text = "High distribution, but engagement per impression below baseline.";
  else if (loD && hiQ) text = "Low distribution relative to baseline, while engagement quality was above baseline - the post may have been stronger than its reach suggests.";
  else if (loD && loQ) text = "Low distribution and low engagement quality relative to baseline.";
  else if (hiD) text = "High distribution relative to baseline; engagement quality in the typical range.";
  else if (loD) text = "Low distribution relative to baseline; engagement quality in the typical range.";
  else if (hiQ) text = "Typical distribution; engagement quality above baseline.";
  else if (loQ) text = "Typical distribution; engagement quality below baseline.";
  else text = "Distribution and engagement quality both in the typical range.";
  if (s.lowConfidence) text += " Under 200 impressions, so the rates are noisy.";
  if (maturing) text += " Published less than 48h before the last sync - numbers are still moving.";
  return text;
}
