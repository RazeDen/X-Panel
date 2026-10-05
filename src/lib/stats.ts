/** Small, dependency-free statistics helpers. Every function ignores null/undefined/NaN. */
export type Num = number | null | undefined;

export function clean(values: Num[]): number[] {
  return values.filter((v): v is number => typeof v === "number" && Number.isFinite(v));
}
export function sum(values: Num[]): number | null {
  const v = clean(values);
  return v.length ? v.reduce((a, b) => a + b, 0) : null;
}
export function mean(values: Num[]): number | null {
  const v = clean(values);
  return v.length ? v.reduce((a, b) => a + b, 0) / v.length : null;
}
/** Linear-interpolated quantile, q in [0, 1]. */
export function quantile(values: Num[], q: number): number | null {
  const v = clean(values).sort((a, b) => a - b);
  if (!v.length) return null;
  const pos = (v.length - 1) * q;
  const lo = Math.floor(pos);
  const hi = Math.ceil(pos);
  return v[lo] + (v[hi] - v[lo]) * (pos - lo);
}
export function median(values: Num[]): number | null {
  return quantile(values, 0.5);
}
/** Median absolute deviation (unscaled). */
export function mad(values: Num[]): number | null {
  const m = median(values);
  if (m === null) return null;
  return median(clean(values).map((x) => Math.abs(x - m)));
}
/**
 * Percentile rank of x within a reference set, 0-100, using the mid-rank
 * convention: (count below + half of ties) / n. x itself is not part of the set.
 */
export function percentileRank(reference: Num[], x: Num): number | null {
  const v = clean(reference);
  if (!v.length || typeof x !== "number" || !Number.isFinite(x)) return null;
  let below = 0;
  let equal = 0;
  for (const r of v) {
    if (r < x) below++;
    else if (r === x) equal++;
  }
  return ((below + equal / 2) / v.length) * 100;
}
/** Relative change (a vs b) as a fraction; null when the base is missing or zero. */
export function pctChange(current: Num, base: Num): number | null {
  if (typeof current !== "number" || typeof base !== "number" || !Number.isFinite(current) || !Number.isFinite(base) || base === 0) return null;
  return (current - base) / base;
}
/** Safe ratio: null (not zero) when the numerator is unavailable or the denominator is missing/zero. */
export function ratio(n: Num, d: Num): number | null {
  if (typeof n !== "number" || typeof d !== "number" || !Number.isFinite(n) || !Number.isFinite(d) || d <= 0) return null;
  return n / d;
}
