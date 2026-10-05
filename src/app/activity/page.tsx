import Link from "next/link";
import { getDataset } from "@/lib/data";
import { activityPeriods, buildActivity, currentStreak, streakRange } from "@/lib/analytics/activity";
import { longDate } from "@/lib/time";
import { fmtInt } from "@/lib/format";
import { Card, EmptyDatabase, PageHeader, StatCard } from "@/components/ui";
import { Heatmap } from "@/components/Heatmap";

export const dynamic = "force-dynamic";

const pct = (a: number, b: number) => (b ? `${Math.round((a / b) * 100)}%` : "—");
const hourLabel = (h: number) => `${String(h).padStart(2, "0")}:00-${String((h + 1) % 24).padStart(2, "0")}:00`;

export default async function ActivityPage({ searchParams }: { searchParams: Promise<Record<string, string | string[] | undefined>> }) {
  const ds = getDataset();
  if (ds.empty) return <EmptyDatabase />;
  const now = new Date();
  const sp = await searchParams;
  const periods = activityPeriods(ds.originals, now);
  const period = periods.find((p) => p.key === sp.period) ?? periods[0];
  const a = buildActivity(ds.originals, period);
  const cur = currentStreak(ds.originals, now);

  return (
    <>
      <PageHeader title="Activity" subtitle="How often you post: original posts per day in Europe/Warsaw time. Replies, reposts and articles are not counted." />

      <nav aria-label="Period" className="seg mb-4">
        {periods.map((p) => (
          <Link key={p.key} href={p.key === "12m" ? "/activity" : `/activity?period=${p.key}`}
            aria-current={p.key === period.key ? "page" : undefined} className={`seg-item ${p.key === period.key ? "seg-active" : ""}`}>
            {p.label}
          </Link>
        ))}
      </nav>

      <div className="grid grid-cols-2 gap-3 md:grid-cols-3 xl:grid-cols-6">
        <StatCard label="Posts" value={fmtInt(a.posts)} sub={`in ${fmtInt(a.periodDays)} days`} />
        <StatCard label="Active days" value={fmtInt(a.activeDays)} sub={`${pct(a.activeDays, a.periodDays)} of days`} hint="Days with at least one original post." />
        <StatCard label="Current streak" value={`${cur.days} ${cur.days === 1 ? "day" : "days"}`} sub={cur.days ? (cur.postedToday ? "including today" : "nothing posted today yet") : "post today to start one"} hint="Consecutive days with at least one post, ending today. Independent of the selected period." />
        <StatCard label="Longest streak" value={`${a.longest.days} ${a.longest.days === 1 ? "day" : "days"}`} sub={streakRange(a.longest)} />
        <StatCard label="Peak hour" value={a.peakHour ? `${String(a.peakHour.hour).padStart(2, "0")}:00` : "—"} sub={a.peakHour ? `${hourLabel(a.peakHour.hour)} · ${a.peakHour.n} of ${a.posts} posts${a.peakHour.n === 1 ? " · n=1" : ""}` : undefined} hint="The hour of day you publish most often. Says nothing about reach - see Timing for that." />
        <StatCard label="Top format" value={a.topFormat?.format ?? "—"} sub={a.topFormat ? `${a.topFormat.n} of ${a.posts} posts` : undefined} />
      </div>

      <Card className="mt-4" title={`${fmtInt(a.posts)} ${a.posts === 1 ? "post" : "posts"} · ${period.label}`}
        subtitle={a.busiest ? `Busiest day: ${longDate(a.busiest.date)} with ${a.busiest.count} post${a.busiest.count === 1 ? "" : "s"}.` : "No posts in this period."}>
        <Heatmap a={a} />
      </Card>
    </>
  );
}
