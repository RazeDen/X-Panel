import { fmtCompact, fmtDelta, fmtMultiple, fmtPercentile, fmtRate, preview } from "../format";
import { pctChange } from "../stats";
import { addDays, prevWeek, today, weekFromKey, weekOfDate, type WeekInfo, TIME_BUCKETS, DOW_NAMES } from "../time";
import { groupPosts, summarize } from "./summary";
import { MIN_SAMPLE, type GroupRow, type Post, type Summary } from "./types";

/**
 * Weekly report. Everything here is computed deterministically from stored data.
 * Statements are tagged:
 *   DATA        - a measured fact, always with its sample size
 *   HYPOTHESIS  - a possible explanation, explicitly not established by the data
 */
export interface Delta { current: number | null; base: number | null; change: number | null }
export interface PostRef {
  id: number;
  preview: string;
  url: string;
  localDate: string;
  localTime: string;
  impressions: number | null;
  engagementRate: number | null;
  distribution: number | null;
  quality: number | null;
  lift: number | null;
  expectedLow: number | null;
  expectedHigh: number | null;
  outlier: string | null;
  maturing: boolean;
  tags: string[];
}
export interface Statement { kind: "DATA" | "HYPOTHESIS" | "EXPERIMENT" | "NOTE"; text: string }
export interface WeeklyReport {
  week: WeekInfo;
  generatedAt: string;
  complete: boolean; // false while the week is still running
  summary: Summary;
  previous: { week: WeekInfo; summary: Summary };
  baseline30: { start: string; end: string; summary: Summary };
  vsPrevious: Record<string, Delta>;
  vsBaseline: Record<string, Delta>;
  topPosts: PostRef[];
  bottomPosts: PostRef[];
  positiveOutliers: PostRef[];
  negativeOutliers: PostRef[];
  byTopic: GroupRow[];
  byContentType: GroupRow[];
  byHook: GroupRow[];
  byFormat: GroupRow[];
  byBucket: GroupRow[];
  byDow: GroupRow[];
  worked: Statement[];
  underperformed: Statement[];
  signals: Statement[];
  hypotheses: Statement[];
  experiments: Statement[];
  warnings: string[];
}

export function postRef(p: Post): PostRef {
  return {
    id: p.id,
    preview: preview(p.article_title || p.text, 120),
    url: p.url,
    localDate: p.localDate,
    localTime: p.localTime,
    impressions: p.impressions,
    engagementRate: p.engagement_rate,
    distribution: p.score?.distribution ?? null,
    quality: p.score?.quality ?? null,
    lift: p.score?.lift ?? null,
    expectedLow: p.score?.expectedLow ?? null,
    expectedHigh: p.score?.expectedHigh ?? null,
    outlier: p.score?.outlier ?? null,
    maturing: p.maturing,
    tags: [p.topic, p.format, p.hook_type, p.content_type].filter((t): t is string => !!t),
  };
}

const METRICS: { key: string; pick: (s: Summary) => number | null }[] = [
  { key: "posts", pick: (s) => s.n },
  { key: "totalImpressions", pick: (s) => s.totalImpressions },
  { key: "medianImpressions", pick: (s) => s.medianImpressions },
  { key: "avgImpressions", pick: (s) => s.avgImpressions },
  { key: "totalEngagements", pick: (s) => s.totalEngagements },
  { key: "medianEngagementRate", pick: (s) => s.medianEngagementRate },
  { key: "avgEngagementRate", pick: (s) => s.avgEngagementRate },
  { key: "medianLikeRate", pick: (s) => s.medianLikeRate },
  { key: "medianReplyRate", pick: (s) => s.medianReplyRate },
  { key: "medianRepostRate", pick: (s) => s.medianRepostRate },
  { key: "medianBookmarkRate", pick: (s) => s.medianBookmarkRate },
  { key: "medianProfileVisitRate", pick: (s) => s.medianProfileVisitRate },
];
function deltas(cur: Summary, base: Summary): Record<string, Delta> {
  const out: Record<string, Delta> = {};
  for (const m of METRICS) {
    const c = cur.n ? m.pick(cur) : m.key === "posts" ? 0 : null;
    const b = base.n ? m.pick(base) : m.key === "posts" ? 0 : null;
    out[m.key] = { current: c, base: b, change: pctChange(c, b) };
  }
  return out;
}

export function weeksWithPosts(originals: Post[], now: Date = new Date()): WeekInfo[] {
  const keys = new Set(originals.map((p) => p.weekKey));
  keys.add(weekOfDate(today(now)).key);
  return [...keys].map((k) => weekFromKey(k)).filter((w): w is WeekInfo => !!w).sort((a, b) => b.start.localeCompare(a.start));
}

export function buildWeeklyReport(originals: Post[], weekKey: string, now: Date = new Date()): WeeklyReport | null {
  const week = weekFromKey(weekKey);
  if (!week) return null;
  const inRange = (p: Post, s: string, e: string) => p.localDate >= s && p.localDate <= e;
  const posts = originals.filter((p) => inRange(p, week.start, week.end));
  const prev = prevWeek(week);
  const prevPosts = originals.filter((p) => inRange(p, prev.start, prev.end));
  const baseStart = addDays(week.start, -30);
  const baseEnd = addDays(week.start, -1);
  const basePosts = originals.filter((p) => inRange(p, baseStart, baseEnd));

  const summary = summarize(posts);
  const previous = summarize(prevPosts);
  const baseline = summarize(basePosts);
  const complete = week.end < today(now);

  const withImp = posts.filter((p) => p.impressions !== null);
  const byImp = [...withImp].sort((a, b) => (b.impressions as number) - (a.impressions as number));
  const k = Math.min(3, Math.max(1, Math.floor(withImp.length / 2)));
  const topPosts = byImp.slice(0, k).map(postRef);
  const bottomPosts = withImp.length > k ? byImp.slice(-k).reverse().map(postRef) : [];
  const positiveOutliers = posts.filter((p) => p.score?.outlier === "far_above" || p.score?.outlier === "above").sort((a, b) => (b.score!.lift) - (a.score!.lift)).map(postRef);
  const negativeOutliers = posts.filter((p) => p.score?.outlier === "below").sort((a, b) => (a.score!.lift) - (b.score!.lift)).map(postRef);

  const byTopic = groupPosts(posts, (p) => p.topic);
  const byContentType = groupPosts(posts, (p) => p.content_type);
  const byHook = groupPosts(posts, (p) => p.hook_type);
  const byFormat = groupPosts(posts, (p) => p.format);
  const byBucket = groupPosts(posts, (p) => p.bucket, TIME_BUCKETS.map((b) => b.label));
  const byDow = groupPosts(posts, (p) => p.dowName, DOW_NAMES);

  const vsPrevious = deltas(summary, previous);
  const vsBaseline = deltas(summary, baseline);

  /* ---------- narrative, generated from the numbers above ---------- */
  const worked: Statement[] = [];
  const underperformed: Statement[] = [];
  const signals: Statement[] = [];
  const hypotheses: Statement[] = [];
  const experiments: Statement[] = [];
  const warnings: string[] = [];
  const data = (text: string): Statement => ({ kind: "DATA", text });
  const wkMedian = summary.medianImpressions;

  if (!posts.length) {
    warnings.push("No original posts were published in this week.");
  } else {
    if (posts.length < MIN_SAMPLE) warnings.push(`Only ${posts.length} post(s) this week - every comparison below is a description of single posts, not a pattern.`);
    const maturing = posts.filter((p) => p.maturing).length;
    if (maturing) warnings.push(`${maturing} post(s) were less than 48h old at the last sync; their numbers are still growing and comparisons with older posts understate them.`);
    if (!prevPosts.length) warnings.push("No posts in the previous week, so week-over-week changes are unavailable.");
    if (basePosts.length < MIN_SAMPLE) warnings.push(`The 30-day baseline before this week holds only ${basePosts.length} post(s); baseline comparisons are weak.`);
    if (!complete) warnings.push("This week is still in progress - totals will change.");

    // Headline movement
    const mv = (label: string, d: Delta, fmt: (v: number | null) => string, base: string, n: number) => {
      if (d.change === null || Math.abs(d.change) < 0.1) return;
      const s = data(`${label} ${d.change > 0 ? "rose" : "fell"} ${fmtDelta(d.change)} vs ${base} (${fmt(d.current)} vs ${fmt(d.base)}; n=${posts.length} vs n=${n}).`);
      (d.change > 0 ? worked : underperformed).push(s);
    };
    mv("Median impressions per post", vsPrevious.medianImpressions, fmtCompact, "the previous week", prevPosts.length);
    mv("Median engagement rate", vsPrevious.medianEngagementRate, (v) => fmtRate(v), "the previous week", prevPosts.length);
    mv("Median bookmark rate", vsPrevious.medianBookmarkRate, (v) => fmtRate(v), "the previous week", prevPosts.length);
    mv("Median impressions per post", vsBaseline.medianImpressions, fmtCompact, "the 30-day baseline", basePosts.length);

    // Best / weakest single posts
    const top = byImp[0];
    if (top) worked.push(data(`Top post by reach: "${preview(top.article_title || top.text, 80)}" - ${fmtCompact(top.impressions)} impressions${wkMedian ? `, ${fmtMultiple((top.impressions as number) / wkMedian)} the week's median` : ""}${top.score ? `, ${fmtPercentile(top.score.distribution)} percentile vs its reference set (n=${top.score.referenceN})` : ""}.`));
    const low = byImp[byImp.length - 1];
    if (low && byImp.length > 1) underperformed.push(data(`Lowest reach: "${preview(low.article_title || low.text, 80)}" - ${fmtCompact(low.impressions)} impressions${low.score ? `, ${fmtPercentile(low.score.distribution)} percentile vs its reference set (n=${low.score.referenceN})` : ""}${low.maturing ? " (still under 48h old at the last sync)" : ""}.`));

    // Groups that differ from the week's median, only with n >= 2 and labelled as low sample below MIN_SAMPLE
    const dims: { label: string; rows: GroupRow[] }[] = [
      { label: "topic", rows: byTopic }, { label: "hook", rows: byHook }, { label: "format", rows: byFormat }, { label: "content type", rows: byContentType },
    ];
    for (const d of dims) {
      if (d.rows.filter((r) => r.key !== "Untagged").length < 2 || !wkMedian) continue;
      for (const r of d.rows) {
        if (r.key === "Untagged" || r.n < 2 || r.medianImpressions === null) continue;
        const mult = r.medianImpressions / wkMedian;
        const tail = `(${fmtCompact(r.medianImpressions)} vs ${fmtCompact(wkMedian)}; n=${r.n}${r.lowSample ? ", low sample" : ""})`;
        if (mult >= 1.3) {
          worked.push(data(`Posts with ${d.label} "${r.key}" had ${fmtMultiple(mult)} the week's median impressions ${tail}.`));
          if (r.lowSample) {
            experiments.push({ kind: "EXPERIMENT", text: `"${r.key}" (${d.label}) looked strong but rests on n=${r.n}. Publish at least ${MIN_SAMPLE - r.n + 1} more before treating it as a pattern.` });
          } else {
            hypotheses.push({ kind: "HYPOTHESIS", text: `"${r.key}" as a ${d.label} may be earning more initial distribution with your audience. The week's data cannot separate this from topic, timing or chance (n=${r.n}).` });
            experiments.push({ kind: "EXPERIMENT", text: `Publish 2-3 more "${r.key}" (${d.label}) posts next week while varying one other element (topic or time slot), to see whether the difference holds beyond n=${r.n}.` });
          }
        } else if (mult <= 0.7) {
          underperformed.push(data(`Posts with ${d.label} "${r.key}" had ${fmtMultiple(mult)} the week's median impressions ${tail}.`));
        }
      }
    }

    // Signals: reach and quality pulling in different directions
    for (const p of posts) {
      const s = p.score;
      if (!s || s.quality === null) continue;
      if (s.distribution <= 33 && s.quality >= 67 && !s.lowConfidence) {
        signals.push(data(`"${preview(p.article_title || p.text, 70)}" had low distribution (${fmtPercentile(s.distribution)} percentile) but high engagement quality (${fmtPercentile(s.quality)} percentile) - ${fmtCompact(p.impressions)} impressions, ${fmtRate(p.engagement_rate)} engagement rate.`));
        hypotheses.push({ kind: "HYPOTHESIS", text: `The idea behind "${preview(p.article_title || p.text, 50)}" may be stronger than its reach suggests; the people who saw it interacted more than usual. Low reach has many possible causes that this data cannot identify.` });
        experiments.push({ kind: "EXPERIMENT", text: `Re-run the angle of "${preview(p.article_title || p.text, 50)}" with a different hook or time slot and compare its distribution percentile.` });
      } else if (s.distribution >= 67 && s.quality <= 33) {
        signals.push(data(`"${preview(p.article_title || p.text, 70)}" reached widely (${fmtPercentile(s.distribution)} percentile) but engagement per impression was low (${fmtPercentile(s.quality)} percentile).`));
      }
    }
    const bm = [...posts].filter((p) => p.bookmark_rate !== null && (p.impressions ?? 0) >= 200).sort((a, b) => (b.bookmark_rate as number) - (a.bookmark_rate as number))[0];
    if (bm && baseline.medianBookmarkRate && (bm.bookmark_rate as number) >= 1.5 * baseline.medianBookmarkRate) {
      signals.push(data(`Highest bookmark rate: "${preview(bm.article_title || bm.text, 70)}" at ${fmtRate(bm.bookmark_rate)} - ${fmtMultiple((bm.bookmark_rate as number) / baseline.medianBookmarkRate)} the 30-day median (${fmtRate(baseline.medianBookmarkRate)}, n=${basePosts.length}).`));
    }
    const pv = [...posts].filter((p) => p.profile_visit_rate !== null && (p.impressions ?? 0) >= 200).sort((a, b) => (b.profile_visit_rate as number) - (a.profile_visit_rate as number))[0];
    if (pv && baseline.medianProfileVisitRate && (pv.profile_visit_rate as number) >= 1.5 * baseline.medianProfileVisitRate) {
      signals.push(data(`Highest profile-visit rate: "${preview(pv.article_title || pv.text, 70)}" at ${fmtRate(pv.profile_visit_rate)} - ${fmtMultiple((pv.profile_visit_rate as number) / baseline.medianProfileVisitRate)} the 30-day median.`));
    }
    for (const o of positiveOutliers.slice(0, 3)) signals.push(data(`Outlier above baseline: "${o.preview}" - ${fmtCompact(o.impressions)} impressions against an expected range of ${fmtCompact(o.expectedLow)}-${fmtCompact(o.expectedHigh)} (${fmtDelta(o.lift)} vs expected median).`));
    for (const o of negativeOutliers.slice(0, 3)) signals.push(data(`Outlier below baseline: "${o.preview}" - ${fmtCompact(o.impressions)} impressions against an expected range of ${fmtCompact(o.expectedLow)}-${fmtCompact(o.expectedHigh)} (${fmtDelta(o.lift)} vs expected median)${o.maturing ? "; under 48h old at the last sync" : ""}.`));

    // Timing: describe, and point at thin cells
    const filled = byBucket.filter((b) => b.n > 0);
    const bestBucket = [...filled].filter((b) => b.n >= 2).sort((a, b) => (b.medianImpressions ?? 0) - (a.medianImpressions ?? 0))[0];
    if (bestBucket && filled.length > 1) signals.push(data(`Time slot with the highest median impressions this week: ${bestBucket.key} (${fmtCompact(bestBucket.medianImpressions)}; n=${bestBucket.n}${bestBucket.lowSample ? ", low sample" : ""}). Timing and content are confounded - this is a correlation only.`));
    const thin = filled.filter((b) => b.n === 1);
    if (thin.length) experiments.push({ kind: "EXPERIMENT", text: `Time slot${thin.length > 1 ? "s" : ""} ${thin.map((b) => b.key).join(", ")} ${thin.length > 1 ? "have" : "has"} a single post this week. Add 2+ posts there before reading anything into the slot.` });

    if (!experiments.length) experiments.push({ kind: "NOTE", text: "No group stood out enough (>= 1.3x the week's median with n >= 2) to suggest a specific test. Keep the mix steady and let the sample grow." });
    if (!hypotheses.length) hypotheses.push({ kind: "NOTE", text: "Nothing in this week's data supports a specific hypothesis yet." });
    if (!signals.length) signals.push({ kind: "NOTE", text: "No notable outliers or reach/quality mismatches this week." });
    if (!worked.length) worked.push({ kind: "NOTE", text: "Nothing clearly outperformed the previous week or the 30-day baseline." });
    if (!underperformed.length) underperformed.push({ kind: "NOTE", text: "Nothing clearly underperformed the previous week or the 30-day baseline." });
  }

  const dedupe = (list: Statement[]) => list.filter((s, i) => list.findIndex((x) => x.text === s.text) === i);
  return {
    week, generatedAt: now.toISOString(), complete, summary,
    previous: { week: prev, summary: previous },
    baseline30: { start: baseStart, end: baseEnd, summary: baseline },
    vsPrevious, vsBaseline, topPosts, bottomPosts, positiveOutliers, negativeOutliers,
    byTopic, byContentType, byHook, byFormat, byBucket, byDow,
    worked: dedupe(worked), underperformed: dedupe(underperformed), signals: dedupe(signals),
    hypotheses: dedupe(hypotheses).slice(0, 6), experiments: dedupe(experiments).slice(0, 6), warnings,
  };
}
