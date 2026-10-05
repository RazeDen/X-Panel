import Link from "next/link";
import { getDataset } from "@/lib/data";
import { applyFilters, dateWindow, parseFilters } from "@/lib/filters";
import { median } from "@/lib/stats";
import { shortDate } from "@/lib/time";
import { fmtCompact, fmtDelta, fmtMultiple, fmtPercentile, fmtRate, preview } from "@/lib/format";
import { Card, Chip, EmptyDatabase, N, Notice, PageHeader } from "@/components/ui";
import { FilterBar } from "@/components/filters";
import { QuadrantChart } from "@/components/charts";
import { PostRows } from "@/components/PostCard";
import { slim } from "@/lib/slim";
import { MIN_REFERENCE, REFERENCE_DAYS, Z_ABOVE, Z_BELOW, Z_FAR_ABOVE } from "@/lib/analytics/scoring";
import type { Post } from "@/lib/analytics/types";

export const dynamic = "force-dynamic";

function OutlierCard({ p, all }: { p: Post; all: Post[] }) {
  const s = p.score!;
  const overall = median(all.map((x) => x.impressions));
  // How this post's tags perform across the whole history, compared with the overall median.
  const dims: { label: string; value: string | null; group: Post[] }[] = [
    { label: "Topic", value: p.topic, group: all.filter((x) => x.topic === p.topic) },
    { label: "Format", value: p.format, group: all.filter((x) => x.format === p.format) },
    { label: "Hook", value: p.hook_type, group: all.filter((x) => x.hook_type === p.hook_type) },
    { label: "Type", value: p.content_type, group: all.filter((x) => x.content_type === p.content_type) },
    { label: "Slot", value: p.bucket, group: all.filter((x) => x.bucket === p.bucket) },
  ];
  const up = s.outlier !== "below";
  return (
    <div className="card card-pad">
      <div className="flex items-start justify-between gap-4">
        <div className="min-w-0">
          <Link href={`/posts/${p.id}`} className="line-clamp-2 text-[13px] font-medium leading-5 text-ink hover:underline">{preview(p.article_title || p.text, 150)}</Link>
          <div className="mt-1 flex flex-wrap items-center gap-1.5 text-xs text-muted">
            <span>{shortDate(p.localDate)} {p.localTime}</span>
            {[p.topic, p.format, p.hook_type, p.content_type].filter(Boolean).map((t) => <Chip key={t}>{t}</Chip>)}
            {p.maturing && <Chip tone="warn">&lt;48h old</Chip>}
          </div>
        </div>
        <div className="num shrink-0 text-right">
          <div className="text-lg font-semibold text-ink">{fmtCompact(p.impressions)}</div>
          <div className={`text-xs ${up ? "text-good" : "text-bad"}`}>{up ? "▲" : "▼"} {fmtDelta(s.lift)}</div>
        </div>
      </div>
      <div className="num mt-3 grid grid-cols-2 gap-x-4 gap-y-1 border-t border-line pt-3 text-xs text-ink2 sm:grid-cols-4">
        <div><span className="text-muted">Expected range</span><br />{fmtCompact(s.expectedLow)} - {fmtCompact(s.expectedHigh)}</div>
        <div><span className="text-muted">Expected median</span><br />{fmtCompact(s.expectedMedian)} <span className="text-muted">(n={s.referenceN})</span></div>
        <div><span className="text-muted">Reach percentile</span><br />{fmtPercentile(s.distribution)}</div>
        <div><span className="text-muted">Engagement quality</span><br />{s.quality === null ? "—" : `${Math.round(s.quality)} / 100`} <span className="text-muted">&middot; ER {fmtRate(p.engagement_rate)}</span></div>
      </div>
      <div className="mt-3 border-t border-line pt-3">
        <div className="label mb-1.5">How this post&apos;s tags perform across your history</div>
        <div className="flex flex-wrap gap-1.5">
          {dims.filter((d) => d.value).map((d) => {
            const m = median(d.group.map((x) => x.impressions));
            return (
              <span key={d.label} className="chip" title={`${d.label} "${d.value}": median ${fmtCompact(m)} impressions over ${d.group.length} posts; overall median ${fmtCompact(overall)}`}>
                {d.label}: {d.value} &middot; {m !== null && overall ? fmtMultiple(m / overall) : "—"} overall median <span className={d.group.length < 3 ? "text-warn" : "text-muted"}>n={d.group.length}</span>
              </span>
            );
          })}
        </div>
      </div>
      <div className="mt-3 flex flex-wrap items-center justify-between gap-2 text-xs">
        <span className="text-ink2">{s.diagnosis}</span>
        {p.topic && <Link className="link shrink-0" href={`/posts?topic=${encodeURIComponent(p.topic)}&format=${encodeURIComponent(p.format ?? "")}`}>Inspect similar posts</Link>}
      </div>
    </div>
  );
}

export default async function OutliersPage({ searchParams }: { searchParams: Promise<Record<string, string | string[] | undefined>> }) {
  const ds = getDataset();
  if (ds.empty) return <EmptyDatabase />;
  const f = parseFilters(await searchParams, { range: "90d" });
  const win = dateWindow(f);
  const posts = applyFilters(ds.originals, f);
  const scored = posts.filter((p) => p.score);
  const far = scored.filter((p) => p.score!.outlier === "far_above").sort((a, b) => b.score!.lift - a.score!.lift);
  const above = scored.filter((p) => p.score!.outlier === "above").sort((a, b) => b.score!.lift - a.score!.lift);
  const below = scored.filter((p) => p.score!.outlier === "below").sort((a, b) => a.score!.lift - b.score!.lift);
  const hidden = scored.filter((p) => p.score!.quality !== null && p.score!.distribution <= 33 && (p.score!.quality as number) >= 67 && !p.score!.lowConfidence)
    .sort((a, b) => (b.score!.quality as number) - (a.score!.quality as number));
  const points = scored.filter((p) => p.score!.quality !== null).map((p) => ({ id: p.id, x: p.score!.distribution, y: p.score!.quality as number, label: preview(p.article_title || p.text, 90), impressions: p.impressions, outlier: p.score!.outlier }));
  const list = (title: string, subtitle: string, items: Post[]) => (
    <section className="mt-6">
      <div className="mb-2 flex items-baseline justify-between"><h2 className="text-[13px] font-semibold text-ink">{title}</h2><N n={items.length} min={0} /></div>
      <p className="mb-3 text-xs text-muted">{subtitle}</p>
      {items.length ? <div className="grid gap-3 xl:grid-cols-2">{items.map((p) => <OutlierCard key={p.id} p={p} all={ds.originals} />)}</div>
        : <div className="rounded-md border border-dashed border-line px-4 py-5 text-center text-xs text-muted">None in this range.</div>}
    </section>
  );

  return (
    <>
      <PageHeader title="Outliers" subtitle="Posts whose reach is far from what your own recent posts typically get. Each post is compared with the posts you published in the 90 days before it." />
      <FilterBar show={["range"]} defaultRange="90d" windowLabel={win.label} count={`${win.label} · ${scored.length} scored posts`} />
      {posts.length - scored.length > 0 && <div className="mb-4"><Notice>{posts.length - scored.length} post(s) in this range could not be scored (no impression count, or fewer than {MIN_REFERENCE} posts to compare with).</Notice></div>}

      <div className="grid gap-4 xl:grid-cols-[minmax(0,1.3fr)_minmax(0,1fr)]">
        <Card title="Reach against engagement quality" subtitle="Each dot is a post. Right = more reach than usual; up = more interaction per impression than usual. Green = outlier above baseline, red = below, blue = within the usual range. Click a dot to open the post.">
          <QuadrantChart points={points} />
          <div className="mt-1 grid grid-cols-2 gap-x-4 text-[11px] leading-4 text-muted">
            <span>Top-left: engaged readers, low distribution.</span><span className="text-right">Top-right: strong on both.</span>
            <span>Bottom-left: weak on both.</span><span className="text-right">Bottom-right: wide reach, little interaction.</span>
          </div>
        </Card>
        <Card title="Low distribution, high engagement quality" subtitle="Reach in the bottom third, engagement per impression in the top third. These may have been stronger than their reach suggests - the data cannot say why reach was low." action={<N n={hidden.length} min={0} />}>
          <PostRows posts={hidden.slice(0, 6).map((p) => slim(p))} metric="lift" />
        </Card>
      </div>

      {list("Far above baseline", `Robust z-score of ${Z_FAR_ABOVE} or more - your "viral" posts relative to your own history.`, far)}
      {list("Unexpectedly strong", `Robust z-score between ${Z_ABOVE} and ${Z_FAR_ABOVE}.`, above)}
      {list("Unexpectedly weak", `Robust z-score of ${Z_BELOW} or less. Posts under 48 hours old are flagged because they are still accumulating.`, below)}

      <Card className="mt-6" title="How outliers are detected">
        <div className="space-y-2 text-[13px] leading-5 text-ink2">
          <p>For each post, the reference set is your other original posts from the {REFERENCE_DAYS} days before it (all other posts if fewer than {MIN_REFERENCE} exist). The expected range is the 25th-75th percentile of impressions in that set.</p>
          <p>Because reach is heavy-tailed, the test uses log10(impressions) with the median and the median absolute deviation (MAD): robust z = 0.6745 &times; (value - median) / MAD. One viral post cannot shift this baseline the way it shifts an average.</p>
          <p>This is a description of how unusual a post was for this account. It is not a predictive model and says nothing about why a post over- or under-performed.</p>
        </div>
      </Card>
    </>
  );
}
