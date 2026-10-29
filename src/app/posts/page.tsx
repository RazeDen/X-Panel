import { getDataset, getSnapshotPoints, tagValues } from "@/lib/data";
import { impressionsAtAge } from "@/lib/analytics/growth";
import { applyFilters, dateWindow, parseFilters } from "@/lib/filters";
import { summarize } from "@/lib/analytics/summary";
import { slim } from "@/lib/slim";
import { fmtCompact, fmtRate } from "@/lib/format";
import { Card, EmptyDatabase, Notice, PageHeader } from "@/components/ui";
import { FilterBar, UrlTabs } from "@/components/filters";
import { PostsTable } from "@/components/PostsTable";
import { requestAccountKey } from "@/lib/request-account";
import { enterAccount } from "@/lib/accounts";

export const dynamic = "force-dynamic";

export default async function PostsPage({ searchParams }: { searchParams: Promise<Record<string, string | string[] | undefined>> }) {
  enterAccount(await requestAccountKey());
  const ds = getDataset();
  if (ds.empty) return <EmptyDatabase />;
  // Only original posts are listed here (owner's choice); replies, reposts and articles stay reachable by URL.
  const sp = await searchParams;
  const f = { ...parseFilters(sp, { range: "all" }), kind: "original" as const };
  const win = dateWindow(f);
  // "Hidden" lists the posts the owner hid (kept in the database, left out of every number) so they can be restored.
  const hiddenOriginals = ds.hidden.filter((p) => p.isOriginal);
  const showHidden = sp.show === "hidden";
  const rows = applyFilters(showHidden ? hiddenOriginals : ds.originals, f);
  const tags = tagValues(ds.originals);
  const s = summarize(rows.filter((p) => p.isOriginal));
  const early = getSnapshotPoints({ maxAgeHours: 2 });
  return (
    <>
      <PageHeader title="Posts" subtitle="Every original post. Filter, sort by any metric, and open a post for its full analytics."
        tabs={hiddenOriginals.length > 0 || showHidden
          ? <UrlTabs param="show" fallback="visible" variant="underline" options={[{ key: "visible", label: "All posts" }, { key: "hidden", label: `Hidden · ${hiddenOriginals.length}` }]} />
          : undefined} />
      {showHidden && <div className="mb-4"><Notice>Hidden posts are left out of every list and number in the dashboard and in Claude. Nothing is deleted: their history is kept and still updated. Restore a post to bring it back.</Notice></div>}
      <FilterBar show={["range", "series", "min", "q"]} defaultRange="all" windowLabel={win.label}
        options={{ series: tags.series }}
        count={`${rows.length} posts · median ${fmtCompact(s.medianImpressions)} impr. · median ER ${fmtRate(s.medianEngagementRate)}`} />
      <Card pad={false}>
        <PostsTable hideable posts={rows.map((p) => {
          const fh = impressionsAtAge(p.created_at, early.get(p.id) ?? [], 1);
          return { ...slim(p), firstHour: fh?.value ?? null, firstHourEstimated: fh?.estimated ?? false };
        })} />
      </Card>
    </>
  );
}
