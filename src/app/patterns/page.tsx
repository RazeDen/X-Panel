import { getDataset } from "@/lib/data";
import { applyFilters, dateWindow, parseFilters, toQuery } from "@/lib/filters";
import { groupPosts, summarize } from "@/lib/analytics/summary";
import { MIN_SAMPLE, type GroupRow, type Post } from "@/lib/analytics/types";
import { DOW_NAMES, TIME_BUCKETS } from "@/lib/time";
import { fmtCompact, fmtRate } from "@/lib/format";
import { Card, EmptyDatabase, Notice, PageHeader } from "@/components/ui";
import { FilterBar } from "@/components/filters";
import { HBars, type HBarRow } from "@/components/HBars";

export const dynamic = "force-dynamic";

/** Groups with enough posts first (ranked), low-sample groups after them (dimmed). */
function rank(rows: GroupRow[], pick: (r: GroupRow) => number | null, display: (v: number | null) => string, href: (key: string) => string | undefined, label?: (r: GroupRow) => string): HBarRow[] {
  const val = (r: GroupRow) => pick(r) ?? -1;
  const ok = rows.filter((r) => !r.lowSample && r.key !== "Untagged").sort((a, b) => val(b) - val(a));
  const low = rows.filter((r) => r.lowSample && r.key !== "Untagged").sort((a, b) => val(b) - val(a));
  return [...ok, ...low].map((r) => ({ key: label ? label(r) : r.key, value: pick(r), display: display(pick(r)), n: r.n, href: href(r.key) }));
}

export default async function PatternsPage({ searchParams }: { searchParams: Promise<Record<string, string | string[] | undefined>> }) {
  const ds = getDataset();
  if (ds.empty) return <EmptyDatabase />;
  const f = parseFilters(await searchParams, { range: "90d" });
  const win = dateWindow(f);
  const posts = applyFilters(ds.originals, f);
  const overall = summarize(posts);
  const q = (extra: Record<string, string>) => `/posts${toQuery({ range: f.range, ...extra })}`;
  const g = (fn: (p: Post) => string | null, order?: string[]) => groupPosts(posts, fn, order);
  const topic = g((p) => p.topic), hook = g((p) => p.hook_type), format = g((p) => p.format), ctype = g((p) => p.content_type);
  const bucket = g((p) => p.bucket, TIME_BUCKETS.map((b) => b.label)), dow = g((p) => p.dowName, DOW_NAMES);

  const imp = (r: GroupRow) => r.medianImpressions;
  // Rate rankings pool every tag dimension, so the label says which dimension a row belongs to.
  const pooled: { dim: string; param: string; rows: GroupRow[] }[] = [
    { dim: "Topic", param: "topic", rows: topic }, { dim: "Hook", param: "hook", rows: hook },
    { dim: "Format", param: "format", rows: format }, { dim: "Type", param: "ctype", rows: ctype },
  ];
  const rateRank = (pick: (r: GroupRow) => number | null): HBarRow[] =>
    pooled.flatMap((d) => d.rows.filter((r) => !r.lowSample && r.key !== "Untagged" && pick(r) !== null)
      .map((r) => ({ key: `${d.dim}: ${r.key}`, value: pick(r), display: fmtRate(pick(r), 3), n: r.n, href: q({ [d.param]: r.key }) })))
      .sort((a, b) => (b.value ?? 0) - (a.value ?? 0)).slice(0, 8);

  const section = (title: string, rows: GroupRow[], param: string | null, extra?: (key: string) => Record<string, string>) => (
    <Card title={title} subtitle={`Median impressions per post. Overall median: ${fmtCompact(overall.medianImpressions)}.`}>
      <HBars rows={rank(rows, imp, fmtCompact, (k) => (param ? q({ [param]: k }) : extra ? q(extra(k)) : undefined))} />
    </Card>
  );

  return (
    <>
      <PageHeader title="Patterns" subtitle={`Which tags and time slots go with higher reach and stronger engagement over a longer period. Rankings only include groups with at least ${MIN_SAMPLE} posts; smaller groups are listed after them, dimmed.`} />
      <FilterBar show={["range"]} defaultRange="90d" windowLabel={win.label} count={`${win.label} · ${posts.length} posts`} />
      {posts.length < 20 && <div className="mb-4"><Notice tone="warn">Only {posts.length} posts in this range. Most groups will be too small to compare - widen the range.</Notice></div>}
      <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-3">
        {section("Best topics by median views", topic, "topic")}
        {section("Best hooks", hook, "hook")}
        {section("Best formats", format, "format")}
        {section("Best content types", ctype, "ctype")}
        {section("Best time slots", bucket, null, (k) => ({ slot: k }))}
        {section("Best days", dow, null, (k) => ({ dow: k }))}
        <Card title="Highest bookmark-rate categories" subtitle={`Median bookmark rate. Overall: ${fmtRate(overall.medianBookmarkRate, 3)}.`}>
          <HBars rows={rateRank((r) => r.medianBookmarkRate)} empty={`No tag group has ${MIN_SAMPLE}+ posts in this range`} />
        </Card>
        <Card title="Highest repost-rate categories" subtitle={`Median repost rate. Overall: ${fmtRate(overall.medianRepostRate, 3)}.`}>
          <HBars rows={rateRank((r) => r.medianRepostRate)} empty={`No tag group has ${MIN_SAMPLE}+ posts in this range`} />
        </Card>
        <Card title="Highest engagement-rate categories" subtitle={`Median engagement rate. Overall: ${fmtRate(overall.medianEngagementRate)}.`}>
          <HBars rows={rateRank((r) => r.medianEngagementRate).map((r) => ({ ...r, display: fmtRate(r.value) }))} empty={`No tag group has ${MIN_SAMPLE}+ posts in this range`} />
        </Card>
      </div>
      <p className="mt-3 text-xs leading-5 text-muted">Patterns describe what happened in your history. Tags overlap (a hook type often comes with a particular topic and format), so a ranking here is a starting point for an experiment, not proof of cause.</p>
    </>
  );
}
