import Link from "next/link";
import { getDataset } from "@/lib/data";
import { applyFilters, dateWindow, parseFilters, previousWindow, inWindow } from "@/lib/filters";
import { summarize } from "@/lib/analytics/summary";
import { buildSeries } from "@/lib/analytics/series";
import { pctChange } from "@/lib/stats";
import { addDays, DOW_NAMES, today, weekOfDate, prevWeek, formatDateTime } from "@/lib/time";
import { fmtCompact, fmtDelta, fmtInt, fmtRate } from "@/lib/format";
import { slim } from "@/lib/slim";
import { Card, EmptyDatabase, N, Notice, PageHeader, StatCard } from "@/components/ui";
import { BarsChart, LinesChart } from "@/components/charts";
import { FilterBar } from "@/components/filters";
import { PostCard } from "@/components/PostCard";
import type { Post, Summary } from "@/lib/analytics/types";

export const dynamic = "force-dynamic";

export default async function Overview({ searchParams }: { searchParams: Promise<Record<string, string | string[] | undefined>> }) {
  const ds = getDataset();
  if (ds.empty) return <EmptyDatabase />;
  const now = new Date();
  const f = parseFilters(await searchParams, { range: "7d" });
  const win = dateWindow(f, now);
  const posts = applyFilters(ds.originals, f, now);
  const cur = summarize(posts);
  const pw = previousWindow(f, now);
  const prevPosts = pw ? ds.originals.filter((p) => inWindow(p, pw.start, pw.end)) : [];
  const prev: Summary | null = pw ? summarize(prevPosts) : null;
  const vs = pw ? `vs prev ${win.days} days` : undefined;
  const ch = (a: number | null, b: number | null | undefined) => (prev && prev.n ? pctChange(a, b ?? null) : null);

  const first = ds.originals.length ? ds.originals[ds.originals.length - 1].localDate : today(now);
  const { points, granularity } = buildSeries(posts, win.start ?? first, win.end ?? today(now));
  const unit = granularity === "day" ? "day" : granularity === "week" ? "week" : "month";

  // Week comparison: the current calendar week if it has posts, otherwise the last one that does.
  let wk = weekOfDate(today(now));
  if (!ds.originals.some((p) => p.weekKey === wk.key)) {
    const latest = ds.originals[0];
    if (latest) wk = weekOfDate(latest.localDate);
  }
  const pwk = prevWeek(wk);
  const byDay = (w: { start: string }, i: number) => ds.originals.filter((p) => p.localDate === addDays(w.start, i));
  const weekRows = DOW_NAMES.map((d, i) => {
    const a = byDay(wk, i), b = byDay(pwk, i);
    return {
      label: d,
      current: a.length ? a.reduce((s, p) => s + (p.impressions ?? 0), 0) : null,
      previous: b.length ? b.reduce((s, p) => s + (p.impressions ?? 0), 0) : null,
      note: `${a.length} post(s) this week, ${b.length} the week before`,
    };
  });

  const withImp = posts.filter((p) => p.impressions !== null);
  const best = [...withImp].sort((a, b) => (b.impressions as number) - (a.impressions as number))[0] ?? null;
  const settled = withImp.filter((p) => !p.maturing);
  const worst = [...(settled.length ? settled : withImp)].sort((a, b) => (a.impressions as number) - (b.impressions as number))[0] ?? null;
  const scored = posts.filter((p) => p.score);
  const posOut = [...scored].sort((a, b) => b.score!.lift - a.score!.lift)[0] ?? null;
  const negPool = scored.filter((p) => !p.maturing);
  const negOut = [...(negPool.length ? negPool : scored)].sort((a, b) => a.score!.lift - b.score!.lift)[0] ?? null;
  const liftText = (p: Post | null) =>
    p?.score ? `${fmtDelta(p.score.lift)} vs expected median ${fmtCompact(p.score.expectedMedian)} (range ${fmtCompact(p.score.expectedLow)}-${fmtCompact(p.score.expectedHigh)}, n=${p.score.referenceN})` : undefined;

  const followers = ds.followers;
  const fNow = followers[followers.length - 1];
  const fFirst = followers[0];

  const windows = [
    { label: "Last 7 days", days: 7 }, { label: "Last 30 days", days: 30 }, { label: "Last 90 days", days: 90 }, { label: "All time", days: null as number | null },
  ].map((w) => {
    const end = today(now);
    const ps = w.days ? ds.originals.filter((p) => inWindow(p, addDays(end, -((w.days as number) - 1)), end)) : ds.originals;
    return { label: w.label, s: summarize(ps) };
  });
  const maturing = posts.filter((p) => p.maturing).length;

  return (
    <>
      <PageHeader title="Overview" subtitle={<>Original posts by @{ds.account.username}. Replies, reposts and articles are stored but excluded from every number here. {ds.lastSync && <>Last synced {formatDateTime(ds.lastSync)}.</>}</>} />
      <FilterBar show={["range"]} defaultRange="7d" windowLabel={win.label} count={`${win.label} · ${posts.length} posts`} />
      {maturing > 0 && <div className="mb-4"><Notice tone="warn">{maturing} post{maturing > 1 ? "s" : ""} in this range {maturing > 1 ? "were" : "was"} published less than 48h before the last sync. Their numbers are still growing, so period comparisons understate them.</Notice></div>}

      <div className="grid grid-cols-2 gap-3 md:grid-cols-3 xl:grid-cols-6">
        <StatCard label="Posts" value={fmtInt(cur.n)} delta={prev ? pctChange(cur.n, prev.n) : undefined} deltaLabel={vs} />
        <StatCard label="Total impressions" value={fmtCompact(cur.totalImpressions)} delta={prev ? ch(cur.totalImpressions, prev.totalImpressions) : undefined} deltaLabel={vs} hint={fmtInt(cur.totalImpressions)} />
        <StatCard label="Median impr. / post" value={fmtCompact(cur.medianImpressions)} delta={prev ? ch(cur.medianImpressions, prev.medianImpressions) : undefined} deltaLabel={vs} hint="The middle post. Not distorted by one viral post." />
        <StatCard label="Average impr. / post" value={fmtCompact(cur.avgImpressions)} delta={prev ? ch(cur.avgImpressions, prev.avgImpressions) : undefined} deltaLabel={vs} hint="Mean. Pulled up by viral posts - compare with the median." />
        <StatCard label="Engagement rate" value={fmtRate(cur.medianEngagementRate)} delta={prev ? ch(cur.medianEngagementRate, prev.medianEngagementRate) : undefined} deltaLabel={vs} sub={`median per post · pooled ${fmtRate(cur.pooledEngagementRate)}`} hint="(likes + replies + reposts + quotes + bookmarks) / impressions" />
        <StatCard label="Total engagements" value={fmtCompact(cur.totalEngagements)} delta={prev ? ch(cur.totalEngagements, prev.totalEngagements) : undefined} deltaLabel={vs} sub={`${fmtInt(cur.totalLikes)} likes · ${fmtInt(cur.totalBookmarks)} bookmarks`} />
      </div>

      <div className="mt-4 grid gap-4 lg:grid-cols-2">
        <Card title="Impressions over time" subtitle={`Impressions to date earned by posts published each ${unit}. Click a bar to see those posts.`}>
          <BarsChart format="compact" series={[{ key: "impressions", label: "Impressions" }]} data={points.map((p) => ({ label: p.label, impressions: p.impressions, href: p.posts ? p.href : undefined, note: p.note }))} />
        </Card>
        <Card title="Posts published" subtitle={`Original posts per ${unit}.`}>
          <BarsChart format="int" series={[{ key: "posts", label: "Posts" }]} data={points.map((p) => ({ label: p.label, posts: p.posts, href: p.posts ? p.href : undefined }))} />
        </Card>
        <Card title="Engagement rate over time" subtitle={`Median per-post engagement rate, by publish ${unit}. Gaps are ${unit}s with no posts.`}>
          <LinesChart format="rate" series={[{ key: "er", label: "Median engagement rate" }]} data={points.map((p) => ({ label: p.label, er: p.engagementRate, note: p.note }))} />
        </Card>
        <Card title={`Week ${wk.week} vs week ${pwk.week}`} subtitle={`Impressions by publish day. ${wk.label} against ${pwk.label}.`}>
          <BarsChart format="compact" series={[{ key: "current", label: `Week ${wk.week}` }, { key: "previous", label: `Week ${pwk.week}` }]} data={weekRows} />
          <div className="mt-2 text-right text-xs"><Link className="link" href={`/weekly?week=${wk.key}`}>Open the week {wk.week} report</Link></div>
        </Card>
      </div>

      <div className="mt-4 grid gap-3 md:grid-cols-2 xl:grid-cols-4">
        <PostCard label="Best-performing post" post={best ? slim(best) : null} />
        <PostCard label="Lowest-reach post" post={worst ? slim(worst) : null} />
        <PostCard label="Biggest positive outlier" post={posOut ? slim(posOut) : null} detail={liftText(posOut)} tone="good" />
        <PostCard label="Biggest negative outlier" post={negOut ? slim(negOut) : null} detail={liftText(negOut)} tone="bad" />
      </div>

      <div className="mt-4 grid gap-4 xl:grid-cols-[1fr_280px]">
        <Card className="min-w-0" title="Account baseline" subtitle="Rolling windows ending today. The median is the number to trust; averages are shown for contrast." pad={false}>
          <div className="scroll-x">
            <table className="w-full min-w-[760px]">
              <thead className="border-b border-line">
                <tr>
                  <th className="th">Window</th><th className="th text-right">Posts</th>
                  <th className="th text-right">Median impr.</th><th className="th text-right">Avg impr.</th>
                  <th className="th text-right">Median ER</th><th className="th text-right">Avg ER</th>
                  <th className="th text-right">Like rate (med / avg)</th><th className="th text-right">Avg reply</th>
                  <th className="th text-right">Avg repost</th><th className="th text-right">Avg bookmark</th><th className="th text-right">Avg profile visit</th>
                </tr>
              </thead>
              <tbody>
                {windows.map((w) => (
                  <tr key={w.label} className="border-b border-line/60 last:border-0">
                    <td className="td whitespace-nowrap text-ink">{w.label}</td>
                    <td className="td text-right"><N n={w.s.n} /></td>
                    <td className="td num text-right font-medium text-ink">{fmtInt(w.s.medianImpressions)}</td>
                    <td className="td num text-right">{fmtInt(w.s.avgImpressions)}</td>
                    <td className="td num text-right font-medium text-ink">{fmtRate(w.s.medianEngagementRate)}</td>
                    <td className="td num text-right">{fmtRate(w.s.avgEngagementRate)}</td>
                    <td className="td num text-right">{fmtRate(w.s.medianLikeRate)} / {fmtRate(w.s.avgLikeRate)}</td>
                    <td className="td num text-right">{fmtRate(w.s.avgReplyRate, 3)}</td>
                    <td className="td num text-right">{fmtRate(w.s.avgRepostRate, 3)}</td>
                    <td className="td num text-right">{fmtRate(w.s.avgBookmarkRate, 3)}</td>
                    <td className="td num text-right" title={`${w.s.nWithPrivate} of ${w.s.n} posts have this metric`}>{fmtRate(w.s.avgProfileVisitRate, 3)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </Card>
        <Card title="Followers" subtitle="Recorded at every sync.">
          <div className="num text-2xl font-semibold">{fmtInt(fNow?.followers)}</div>
          <div className="mt-1 text-xs text-muted">
            {followers.length > 1 && fNow?.followers != null && fFirst?.followers != null
              ? <>{fNow.followers - fFirst.followers >= 0 ? "+" : ""}{fNow.followers - fFirst.followers} since {formatDateTime(fFirst.captured_at)} ({followers.length} readings)</>
              : "One reading so far. The trend appears after more syncs."}
          </div>
          {followers.length > 2 && (
            <div className="mt-3"><LinesChart height={110} format="int" series={[{ key: "followers", label: "Followers" }]} data={followers.map((s) => ({ label: formatDateTime(s.captured_at).slice(0, 6), followers: s.followers }))} /></div>
          )}
          <p className="mt-3 text-[11px] leading-4 text-muted">X does not report followers gained per post, so this is account-level only.</p>
        </Card>
      </div>
    </>
  );
}
