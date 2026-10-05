import { getDataset, tagValues } from "@/lib/data";
import { applyFilters, dateWindow, parseFilters } from "@/lib/filters";
import { summarize } from "@/lib/analytics/summary";
import { slim } from "@/lib/slim";
import { fmtCompact, fmtRate } from "@/lib/format";
import { Card, EmptyDatabase, PageHeader } from "@/components/ui";
import { FilterBar } from "@/components/filters";
import { PostsTable } from "@/components/PostsTable";

export const dynamic = "force-dynamic";

export default async function PostsPage({ searchParams }: { searchParams: Promise<Record<string, string | string[] | undefined>> }) {
  const ds = getDataset();
  if (ds.empty) return <EmptyDatabase />;
  const f = parseFilters(await searchParams, { range: "all" });
  const win = dateWindow(f);
  const rows = applyFilters(ds.posts, f);
  const tags = tagValues(ds.originals);
  const s = summarize(rows.filter((p) => p.isOriginal));
  return (
    <>
      <PageHeader title="Posts" subtitle="Every stored post. Filter, sort by any metric, and open a post for its full analytics." />
      <FilterBar show={["range", "kind", "topic", "format", "ctype", "hook", "min", "q"]} defaultRange="all" windowLabel={win.label}
        options={{ topic: tags.topic, format: tags.format, ctype: tags.content_type, hook: tags.hook_type }}
        count={`${rows.length} posts · median ${fmtCompact(s.medianImpressions)} impr. · median ER ${fmtRate(s.medianEngagementRate)}`} />
      <Card pad={false}>
        <PostsTable posts={rows.map((p) => slim(p))} />
      </Card>
    </>
  );
}
