import { getDb } from "../db";
import { fmtCompact, fmtDelta, fmtInt, fmtRate } from "../format";
import type { GroupRow } from "./types";
import type { Delta, PostRef, Statement, WeeklyReport } from "./weekly";

export interface StoredReport {
  week_key: string;
  start_date: string;
  end_date: string;
  generated_at: string;
  post_count: number;
  data_json: string;
  ai_analysis: string | null;
  ai_model: string | null;
}

export function saveReport(r: WeeklyReport, ai?: { text: string; model: string } | null): void {
  getDb().prepare(
    `INSERT INTO weekly_reports (week_key, start_date, end_date, generated_at, post_count, data_json, ai_analysis, ai_model)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?)
     ON CONFLICT(week_key) DO UPDATE SET start_date=excluded.start_date, end_date=excluded.end_date, generated_at=excluded.generated_at,
       post_count=excluded.post_count, data_json=excluded.data_json,
       ai_analysis=COALESCE(excluded.ai_analysis, weekly_reports.ai_analysis), ai_model=COALESCE(excluded.ai_model, weekly_reports.ai_model)`
  ).run(r.week.key, r.week.start, r.week.end, r.generatedAt, r.summary.n, JSON.stringify(r), ai?.text ?? null, ai?.model ?? null);
}
export function getStoredReport(weekKey: string): StoredReport | null {
  return (getDb().prepare("SELECT * FROM weekly_reports WHERE week_key = ?").get(weekKey) as StoredReport | undefined) ?? null;
}
export function listStoredReports(): Pick<StoredReport, "week_key" | "generated_at" | "post_count">[] {
  return getDb().prepare("SELECT week_key, generated_at, post_count FROM weekly_reports ORDER BY week_key DESC").all() as Pick<StoredReport, "week_key" | "generated_at" | "post_count">[];
}

/* ---------- markdown export ---------- */
const d = (x: Delta | undefined) => (x && x.change !== null ? fmtDelta(x.change) : "n/a");
const statements = (list: Statement[]) => list.map((s) => `- **${s.kind}:** ${s.text}`).join("\n") || "- (none)";
const posts = (list: PostRef[]) =>
  list.length
    ? list.map((p) => `- ${fmtCompact(p.impressions)} impressions, ${fmtRate(p.engagementRate)} ER - "${p.preview}" (${p.localDate} ${p.localTime}) ${p.url}`).join("\n")
    : "- (none)";
const groups = (rows: GroupRow[]) =>
  rows.length
    ? "| Group | n | Median impressions | Median ER | Median bookmark rate |\n|---|---|---|---|---|\n" +
      rows.map((g) => `| ${g.key}${g.lowSample ? " (low sample)" : ""} | ${g.n} | ${fmtInt(g.medianImpressions)} | ${fmtRate(g.medianEngagementRate)} | ${fmtRate(g.medianBookmarkRate)} |`).join("\n")
    : "(no posts)";

export function reportToMarkdown(r: WeeklyReport, aiAnalysis?: string | null): string {
  const s = r.summary;
  return `# Week ${r.week.week}, ${r.week.year} - ${r.week.label}

Generated ${r.generatedAt}. Original posts only (replies, reposts and articles excluded). Times in Europe/Warsaw.
${r.warnings.map((w) => `\n> Note: ${w}`).join("")}

## Headline

| Metric | This week | vs previous week | vs 30-day baseline |
|---|---|---|---|
| Posts | ${s.n} | ${d(r.vsPrevious.posts)} | - |
| Total impressions | ${fmtInt(s.totalImpressions)} | ${d(r.vsPrevious.totalImpressions)} | - |
| Median impressions / post | ${fmtInt(s.medianImpressions)} | ${d(r.vsPrevious.medianImpressions)} | ${d(r.vsBaseline.medianImpressions)} |
| Average impressions / post | ${fmtInt(s.avgImpressions)} | ${d(r.vsPrevious.avgImpressions)} | ${d(r.vsBaseline.avgImpressions)} |
| Total engagements | ${fmtInt(s.totalEngagements)} | ${d(r.vsPrevious.totalEngagements)} | - |
| Median engagement rate | ${fmtRate(s.medianEngagementRate)} | ${d(r.vsPrevious.medianEngagementRate)} | ${d(r.vsBaseline.medianEngagementRate)} |
| Median like rate | ${fmtRate(s.medianLikeRate)} | ${d(r.vsPrevious.medianLikeRate)} | ${d(r.vsBaseline.medianLikeRate)} |
| Median reply rate | ${fmtRate(s.medianReplyRate, 3)} | ${d(r.vsPrevious.medianReplyRate)} | ${d(r.vsBaseline.medianReplyRate)} |
| Median repost rate | ${fmtRate(s.medianRepostRate, 3)} | ${d(r.vsPrevious.medianRepostRate)} | ${d(r.vsBaseline.medianRepostRate)} |
| Median bookmark rate | ${fmtRate(s.medianBookmarkRate, 3)} | ${d(r.vsPrevious.medianBookmarkRate)} | ${d(r.vsBaseline.medianBookmarkRate)} |

Totals: ${fmtInt(s.totalLikes)} likes, ${fmtInt(s.totalReplies)} replies, ${fmtInt(s.totalReposts)} reposts, ${fmtInt(s.totalBookmarks)} bookmarks.
Previous week: n=${r.previous.summary.n}. 30-day baseline (${r.baseline30.start} to ${r.baseline30.end}): n=${r.baseline30.summary.n}.

## Top posts
${posts(r.topPosts)}

## Weakest posts
${posts(r.bottomPosts)}

## Outliers
Above baseline:
${posts(r.positiveOutliers)}

Below baseline:
${posts(r.negativeOutliers)}

## By topic
${groups(r.byTopic)}

## By hook
${groups(r.byHook)}

## By format
${groups(r.byFormat)}

## By content type
${groups(r.byContentType)}

## By time slot
${groups(r.byBucket)}

## What worked
${statements(r.worked)}

## What underperformed
${statements(r.underperformed)}

## Interesting signals
${statements(r.signals)}

## Hypotheses
${statements(r.hypotheses)}

## Suggested experiments for next week
${statements(r.experiments)}
${aiAnalysis ? `\n## Written analysis (AI, based on the data above)\n\n${aiAnalysis}\n` : ""}`;
}
