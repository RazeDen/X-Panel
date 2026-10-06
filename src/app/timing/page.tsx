import Link from "next/link";
import { getDataset, tagValues } from "@/lib/data";
import { applyFilters, dateWindow, parseFilters } from "@/lib/filters";
import { groupPosts } from "@/lib/analytics/summary";
import { median } from "@/lib/stats";
import { DOW_NAMES, TIME_BUCKETS, TZ } from "@/lib/time";
import { fmtCompact, fmtRate } from "@/lib/format";
import { Card, EmptyDatabase, Notice, PageHeader } from "@/components/ui";
import { FilterBar } from "@/components/filters";
import { GroupTable } from "@/components/GroupTable";
import { BarsChart } from "@/components/charts";
import { MIN_SAMPLE } from "@/lib/analytics/types";

export const dynamic = "force-dynamic";
/** Sequential ramp from the X blue scale (--x-blue-050 ... 700): more impressions = lighter. */
const RAMP = ["#00154a", "#003886", "#005ac2", "#006fd6", "#0083eb", "#1d9bf0", "#43b3f6", "#6bc9fb"];

export default async function TimingPage({ searchParams }: { searchParams: Promise<Record<string, string | string[] | undefined>> }) {
  const ds = getDataset();
  if (ds.empty) return <EmptyDatabase />;
  const f = parseFilters(await searchParams, { range: "90d" });
  const win = dateWindow(f);
  const posts = applyFilters(ds.originals, f);
  const byBucket = groupPosts(posts, (p) => p.bucket, TIME_BUCKETS.map((b) => b.label));
  const byDow = groupPosts(posts, (p) => p.dowName, DOW_NAMES);
  const hours = Array.from({ length: 24 }, (_, h) => {
    const ps = posts.filter((p) => p.hour === h);
    return { label: String(h).padStart(2, "0"), impressions: ps.length ? median(ps.map((p) => p.impressions)) : null, posts: ps.length, note: `n=${ps.length}${ps.length > 0 && ps.length < MIN_SAMPLE ? " (low sample)" : ""}` };
  });
  const cells = DOW_NAMES.map((d) => TIME_BUCKETS.map((b) => {
    const ps = posts.filter((p) => p.dowName === d && p.bucket === b.label);
    return { n: ps.length, med: median(ps.map((p) => p.impressions)), er: median(ps.map((p) => p.engagement_rate)) };
  }));
  const meds = cells.flat().filter((c) => c.n >= MIN_SAMPLE && c.med !== null).map((c) => c.med as number).sort((a, b) => a - b);
  const shade = (v: number) => RAMP[Math.min(RAMP.length - 1, Math.floor((meds.filter((m) => m <= v).length / Math.max(meds.length, 1)) * (RAMP.length - 1)))];

  return (
    <>
      <PageHeader title="Timing" subtitle={`When you publish and how those posts performed. All times in ${TZ}.`} />
      <FilterBar show={["range", "series"]} defaultRange="90d" windowLabel={win.label} options={{ series: tagValues(ds.originals).series, topic: [], format: [], ctype: [], hook: [] }} count={`${win.label} · ${posts.length} posts`} />
      <div className="mb-4"><Notice>These are correlations. Time slots differ in what you posted there, not only in when - a slot can look strong because one topic or one viral post landed in it. Check the sample size before acting on any cell.</Notice></div>

      <div className="grid gap-4 xl:grid-cols-2">
        <Card title="Median impressions by hour" subtitle="Hour of publishing (local time). Hover for the sample size.">
          <BarsChart format="compact" series={[{ key: "impressions", label: "Median impressions" }]} data={hours} />
        </Card>
        <Card title="Posts by hour" subtitle="How many posts stand behind each bar on the left.">
          <BarsChart format="int" series={[{ key: "posts", label: "Posts" }]} data={hours.map((h) => ({ label: h.label, posts: h.posts }))} />
        </Card>
      </div>

      <Card className="mt-4" title="Day of week by time slot" subtitle={`Median impressions per cell, with the sample size underneath. Cells with fewer than ${MIN_SAMPLE} posts are not shaded.`} pad={false}>
        <div className="scroll-x p-4">
          <table className="w-full min-w-[760px] border-separate border-spacing-0.5">
            <thead><tr><th className="th w-16" />{TIME_BUCKETS.map((b) => <th key={b.key} className="th text-center">{b.label}</th>)}</tr></thead>
            <tbody>
              {DOW_NAMES.map((d, i) => (
                <tr key={d}>
                  <td className="td text-ink">{d}</td>
                  {TIME_BUCKETS.map((b, j) => {
                    const c = cells[i][j];
                    const solid = c.n >= MIN_SAMPLE && c.med !== null;
                    return (
                      <td key={b.key} className="rounded p-0 text-center" style={{ background: solid ? shade(c.med as number) : "transparent" }}>
                        {c.n === 0 ? <div className="rounded border border-dashed border-line py-2.5 text-[11px] text-muted">no posts</div> : (
                          <Link href={`/posts?range=${f.range}&dow=${d}&slot=${encodeURIComponent(b.label)}`} className={`block rounded py-1.5 ${solid ? "" : "border border-line"}`} title={`${d} ${b.label}: median ${fmtCompact(c.med)} impressions, median ER ${fmtRate(c.er)}, n=${c.n}`}>
                            <div className={`num text-[13px] font-medium ${solid ? "text-white" : "text-ink2"}`}>{fmtCompact(c.med)}</div>
                            <div className={`num text-[10px] ${solid ? "text-white/80" : "text-warn"}`}>n={c.n}</div>
                          </Link>
                        )}
                      </td>
                    );
                  })}
                </tr>
              ))}
            </tbody>
          </table>
          <div className="mt-3 flex items-center gap-2 text-[11px] text-muted">
            Lower <span className="flex">{RAMP.map((c) => <span key={c} className="inline-block h-2.5 w-5" style={{ background: c }} />)}</span> Higher median impressions (ranked within this table)
          </div>
        </div>
      </Card>

      <div className="mt-4 grid gap-4">
        <Card title="Time slots" pad={false} className="min-w-0"><GroupTable rows={byBucket} label="Slot" keepOrder hrefFor={Object.fromEntries(byBucket.map((r) => [r.key, `/posts?range=${f.range}&slot=${encodeURIComponent(r.key)}`]))} /></Card>
        <Card title="Days of the week" pad={false} className="min-w-0"><GroupTable rows={byDow} label="Day" keepOrder hrefFor={Object.fromEntries(byDow.map((r) => [r.key, `/posts?range=${f.range}&dow=${r.key}`]))} /></Card>
      </div>
    </>
  );
}
