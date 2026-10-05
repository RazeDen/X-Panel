import Link from "next/link";
import { getDataset } from "@/lib/data";
import { buildWeeklyReport, weeksWithPosts, type Delta as D, type PostRef, type Statement } from "@/lib/analytics/weekly";
import { getStoredReport } from "@/lib/analytics/report-store";
import { nextWeek, prevWeek, today, weekFromKey, weekOfDate, addDays, shortDate, formatDateTime } from "@/lib/time";
import { fmtCompact, fmtInt, fmtRate, fmtDelta, fmtPercentile } from "@/lib/format";
import { Card, Delta, Empty, EmptyDatabase, N, Notice, PageHeader } from "@/components/ui";
import { HBars } from "@/components/HBars";
import { GroupTable } from "@/components/GroupTable";
import type { GroupRow } from "@/lib/analytics/types";

export const dynamic = "force-dynamic";

function Statements({ items }: { items: Statement[] }) {
  if (!items.length) return <div className="text-xs text-muted">Nothing to report.</div>;
  const tone: Record<Statement["kind"], string> = { DATA: "border-accent/50 text-ink", HYPOTHESIS: "border-warn/50 text-warn", EXPERIMENT: "border-good/50 text-good", NOTE: "text-muted" };
  return (
    <ul className="space-y-2.5">
      {items.map((s, i) => (
        <li key={i} className="flex gap-2.5 text-[13px] leading-5 text-ink2">
          <span className={`chip mt-px h-fit shrink-0 ${tone[s.kind]}`}>{s.kind}</span>
          <span>{s.text}</span>
        </li>
      ))}
    </ul>
  );
}

function PostList({ posts, mode }: { posts: PostRef[]; mode: "reach" | "outlier" }) {
  if (!posts.length) return <div className="py-3 text-xs text-muted">None this week.</div>;
  return (
    <ul className="divide-y divide-line/60">
      {posts.map((p) => (
        <li key={p.id} className="flex items-start justify-between gap-4 py-2.5 first:pt-0 last:pb-0">
          <div className="min-w-0">
            <Link href={`/posts/${p.id}`} className="line-clamp-2 text-[13px] leading-5 text-ink hover:underline">{p.preview}</Link>
            <div className="mt-0.5 text-xs text-muted">{shortDate(p.localDate)} {p.localTime} &middot; {p.tags.join(" · ") || "untagged"}{p.maturing && <span className="text-warn"> &middot; &lt;48h old at last sync</span>}</div>
            {mode === "outlier" && <div className="num mt-0.5 text-xs text-ink2">Expected {fmtCompact(p.expectedLow)}-{fmtCompact(p.expectedHigh)} &middot; {fmtDelta(p.lift)} vs expected median &middot; {fmtPercentile(p.distribution)} pct.</div>}
          </div>
          <div className="num shrink-0 text-right">
            <div className="text-[13px] font-semibold text-ink">{fmtCompact(p.impressions)}</div>
            <div className="text-[11px] text-muted">{fmtRate(p.engagementRate)} ER</div>
          </div>
        </li>
      ))}
    </ul>
  );
}

const bars = (rows: GroupRow[], week: string, param: string) =>
  rows.map((r) => ({ key: r.key, value: r.medianImpressions, display: fmtCompact(r.medianImpressions), n: r.n, href: `/posts?week=${week}&${param}=${encodeURIComponent(r.key)}`, sub: `median ER ${fmtRate(r.medianEngagementRate)}` }));

export default async function WeeklyPage({ searchParams }: { searchParams: Promise<Record<string, string | string[] | undefined>> }) {
  const ds = getDataset();
  if (ds.empty) return <EmptyDatabase />;
  const now = new Date();
  const sp = await searchParams;
  const weeks = weeksWithPosts(ds.originals, now);
  const lastComplete = weekOfDate(addDays(today(now), -7));
  const requested = typeof sp.week === "string" ? weekFromKey(sp.week) : null;
  const week = requested ?? (ds.originals.some((p) => p.weekKey === lastComplete.key) ? lastComplete : weeks.find((w) => ds.originals.some((p) => p.weekKey === w.key)) ?? lastComplete);
  const r = buildWeeklyReport(ds.originals, week.key, now)!;
  const stored = getStoredReport(week.key);
  const s = r.summary;
  const pv = prevWeek(week), nx = nextWeek(week);
  const hasNext = nx.start <= today(now);

  const rows: { label: string; value: string; a: D; b?: D; hint?: string }[] = [
    { label: "Posts", value: fmtInt(s.n), a: r.vsPrevious.posts },
    { label: "Total impressions", value: fmtCompact(s.totalImpressions), a: r.vsPrevious.totalImpressions },
    { label: "Median impr. / post", value: fmtCompact(s.medianImpressions), a: r.vsPrevious.medianImpressions, b: r.vsBaseline.medianImpressions },
    { label: "Average impr. / post", value: fmtCompact(s.avgImpressions), a: r.vsPrevious.avgImpressions, b: r.vsBaseline.avgImpressions },
    { label: "Median engagement rate", value: fmtRate(s.medianEngagementRate), a: r.vsPrevious.medianEngagementRate, b: r.vsBaseline.medianEngagementRate },
    { label: "Median bookmark rate", value: fmtRate(s.medianBookmarkRate, 3), a: r.vsPrevious.medianBookmarkRate, b: r.vsBaseline.medianBookmarkRate },
    { label: "Median reply rate", value: fmtRate(s.medianReplyRate, 3), a: r.vsPrevious.medianReplyRate, b: r.vsBaseline.medianReplyRate },
    { label: "Median repost rate", value: fmtRate(s.medianRepostRate, 3), a: r.vsPrevious.medianRepostRate, b: r.vsBaseline.medianRepostRate },
  ];

  return (
    <>
      <PageHeader title={`Week ${week.week}`} subtitle={<>{week.label}, {week.year} &middot; Monday to Sunday, Europe/Warsaw. {r.complete ? "Complete week." : "Week in progress."}</>}>
        <Link className="btn" href={`/weekly?week=${pv.key}`}>&larr; Week {pv.week}</Link>
        <form action="/weekly" className="contents">
          <select name="week" defaultValue={week.key} className="input" aria-label="Select week">
            {!weeks.some((w) => w.key === week.key) && <option value={week.key}>Week {week.week} &middot; {week.label}</option>}
            {weeks.map((w) => <option key={w.key} value={w.key}>Week {w.week}, {w.year} &middot; {w.label}</option>)}
          </select>
          <button className="btn" type="submit">Go</button>
        </form>
        {hasNext ? <Link className="btn" href={`/weekly?week=${nx.key}`}>Week {nx.week} &rarr;</Link> : <span className="btn opacity-40">Week {nx.week} &rarr;</span>}
      </PageHeader>

      <div className="mb-4 space-y-2">
        {r.warnings.map((w) => <Notice key={w} tone="warn">{w}</Notice>)}
        <Notice>
          {stored
            ? <>Saved by <span className="font-mono text-xs">npm run weekly</span> on {formatDateTime(stored.generated_at)} ({stored.post_count} posts at the time). The numbers below are recalculated live from the latest sync.</>
            : <>This week has not been saved yet. Run <span className="font-mono text-xs">npm run weekly -- --week={week.key}</span> to sync, store it and write <span className="font-mono text-xs">reports/{week.key}.md</span>. What you see is calculated live.</>}
        </Notice>
      </div>

      {s.n === 0 ? <Empty>No original posts were published in this week.</Empty> : (
        <>
          <div className="grid grid-cols-2 gap-3 md:grid-cols-4">
            {rows.map((m) => (
              <div key={m.label} className="card card-pad">
                <div className="label">{m.label}</div>
                <div className="num mt-1.5 text-2xl font-semibold tracking-tight">{m.value}</div>
                <div className="mt-1.5 space-y-0.5">
                  <div><Delta value={m.a.change} suffix={`vs week ${pv.week}`} /></div>
                  {m.b && <div><Delta value={m.b.change} suffix="vs 30-day baseline" /></div>}
                </div>
              </div>
            ))}
          </div>
          <p className="mt-2 text-xs text-muted">
            Totals: {fmtInt(s.totalLikes)} likes, {fmtInt(s.totalReplies)} replies, {fmtInt(s.totalReposts)} reposts, {fmtInt(s.totalBookmarks)} bookmarks, {fmtInt(s.totalEngagements)} engagements.
            Compared with week {pv.week} (n={r.previous.summary.n}) and the 30 days before this week, {shortDate(r.baseline30.start)} - {shortDate(r.baseline30.end)} (n={r.baseline30.summary.n}).
          </p>

          <div className="mt-4 grid gap-4 xl:grid-cols-2">
            <Card title="What worked"><Statements items={r.worked} /></Card>
            <Card title="What underperformed"><Statements items={r.underperformed} /></Card>
            <Card title="Interesting signals"><Statements items={r.signals} /></Card>
            <Card title="Hypotheses" subtitle="Possible explanations. None of these is established by the data."><Statements items={r.hypotheses} /></Card>
          </div>
          <Card className="mt-4" title="Suggested experiments for next week"><Statements items={r.experiments} /></Card>

          {stored?.ai_analysis && (
            <Card className="mt-4" title="Written analysis" subtitle={`Generated by ${stored.ai_model ?? "AI"} from the saved report data on ${formatDateTime(stored.generated_at)}.`}>
              <div className="whitespace-pre-wrap text-[13px] leading-6 text-ink2">{stored.ai_analysis}</div>
            </Card>
          )}

          <div className="mt-4 grid gap-4 xl:grid-cols-2">
            <Card title="Top posts" subtitle="By impressions." action={<N n={s.n} />}><PostList posts={r.topPosts} mode="reach" /></Card>
            <Card title="Weak posts" subtitle="Lowest impressions this week."><PostList posts={r.bottomPosts} mode="reach" /></Card>
            <Card title="Outliers above baseline" subtitle="Reach far beyond what your recent posts typically get."><PostList posts={r.positiveOutliers} mode="outlier" /></Card>
            <Card title="Outliers below baseline" subtitle="Reach well under your typical range."><PostList posts={r.negativeOutliers} mode="outlier" /></Card>
          </div>

          <div className="mt-4 grid gap-4 md:grid-cols-2 xl:grid-cols-4">
            <Card title="Topics" subtitle="Median impressions"><HBars rows={bars(r.byTopic, week.key, "topic")} /></Card>
            <Card title="Hooks" subtitle="Median impressions"><HBars rows={bars(r.byHook, week.key, "hook")} /></Card>
            <Card title="Formats" subtitle="Median impressions"><HBars rows={bars(r.byFormat, week.key, "format")} /></Card>
            <Card title="Content types" subtitle="Median impressions"><HBars rows={bars(r.byContentType, week.key, "ctype")} /></Card>
          </div>

          <div className="mt-4 grid gap-4">
            <Card title="Timing: time slots" subtitle="Correlation only - slots differ in content too." pad={false} className="min-w-0"><GroupTable rows={r.byBucket} label="Slot" keepOrder /></Card>
            <Card title="Timing: days" pad={false} className="min-w-0"><GroupTable rows={r.byDow} label="Day" keepOrder /></Card>
          </div>
          <div className="mt-3 text-right text-xs"><Link className="link" href={`/posts?week=${week.key}`}>See all {s.n} posts from this week</Link></div>
        </>
      )}
    </>
  );
}
