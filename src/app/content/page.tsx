import { getDataset, tagValues } from "@/lib/data";
import { applyFilters, dateWindow, parseFilters, toQuery } from "@/lib/filters";
import { dimensionValue, groupPosts, summarize } from "@/lib/analytics/summary";
import { DIMENSIONS } from "@/lib/classify/taxonomy";
import { fmtCompact, fmtRate } from "@/lib/format";
import { Card, EmptyDatabase, Notice, PageHeader } from "@/components/ui";
import { FilterBar, UrlTabs } from "@/components/filters";
import { GroupTable } from "@/components/GroupTable";
import { HBars } from "@/components/HBars";

export const dynamic = "force-dynamic";
const PARAM: Record<string, string> = { topic: "topic", format: "format", content_type: "ctype", hook_type: "hook" };

export default async function ContentPage({ searchParams }: { searchParams: Promise<Record<string, string | string[] | undefined>> }) {
  const ds = getDataset();
  if (ds.empty) return <EmptyDatabase />;
  const sp = await searchParams;
  const f = parseFilters(sp, { range: "90d" });
  const win = dateWindow(f);
  const dimKey = DIMENSIONS.some((d) => d.key === sp.dim) ? (sp.dim as string) : "topic";
  const dim = DIMENSIONS.find((d) => d.key === dimKey)!;
  const posts = applyFilters(ds.originals, f);
  const rows = groupPosts(posts, (p) => dimensionValue(p, dimKey));
  const overall = summarize(posts);
  const tags = tagValues(ds.originals);
  const base = { range: f.range !== "all" ? f.range : "all", week: f.week, from: f.from, to: f.to, topic: f.topic, format: f.format, ctype: f.ctype, hook: f.hook };
  const hrefFor: Record<string, string> = {};
  if (PARAM[dimKey]) for (const r of rows) hrefFor[r.key] = `/posts${toQuery({ ...base, [PARAM[dimKey]]: r.key })}`;
  const untagged = rows.find((r) => r.key === "Untagged");
  const auto = posts.filter((p) => p.class_source === "rule" || p.class_source === null).length;

  return (
    <>
      <PageHeader title="Content" subtitle="Performance grouped by how posts are tagged. Rates are medians of per-post rates. Groups with fewer than 3 posts are dimmed and marked low sample.">
        <UrlTabs param="dim" fallback="topic" options={DIMENSIONS.map((d) => ({ key: d.key, label: d.label }))} />
      </PageHeader>
      <FilterBar show={["range", "topic", "format", "ctype", "hook"]} defaultRange="90d" windowLabel={win.label}
        options={{ topic: tags.topic, format: tags.format, ctype: tags.content_type, hook: tags.hook_type }}
        count={`${win.label} · ${posts.length} posts · overall median ${fmtCompact(overall.medianImpressions)} impr., ${fmtRate(overall.medianEngagementRate)} ER`} />
      {dimKey !== "format" && auto > 0 && (
        <div className="mb-4"><Notice>{auto} of {posts.length} posts here carry automatic keyword tags that nobody has reviewed. A wrong tag puts a post in the wrong group - open a post to correct it.</Notice></div>
      )}
      <div className="grid gap-4 xl:grid-cols-[340px_minmax(0,1fr)]">
        <Card title={`Median impressions by ${dim.label.toLowerCase()}`} subtitle="Click a group to see its posts.">
          <HBars rows={rows.map((r) => ({ key: r.key, value: r.medianImpressions, display: fmtCompact(r.medianImpressions), n: r.n, href: hrefFor[r.key] }))} />
        </Card>
        <Card title={`${dim.plural}`} subtitle={`${rows.length} group${rows.length === 1 ? "" : "s"}${untagged ? ` · ${untagged.n} untagged` : ""}. Click a column to sort.`} pad={false} className="min-w-0">
          <GroupTable rows={rows} label={dim.label} hrefFor={hrefFor} />
        </Card>
      </div>
      <p className="mt-3 text-xs leading-5 text-muted">A higher median for a group describes these posts; it does not show that the tag caused the result. Topic, hook, format and timing overlap heavily in a small account history.</p>
    </>
  );
}
