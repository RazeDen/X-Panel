import Link from "next/link";
import { notFound } from "next/navigation";
import { getDataset, getSnapshots, tagValues } from "@/lib/data";
import { DEFAULT_CONTENT_TYPES, DEFAULT_FORMATS, DEFAULT_HOOK_TYPES, DEFAULT_TOPICS } from "@/lib/classify/taxonomy";
import { median, percentileRank } from "@/lib/stats";
import { addDays, formatDateTime } from "@/lib/time";
import { fmtCompact, fmtDuration, fmtInt, fmtMultiple, fmtPercentile, fmtRate, DASH } from "@/lib/format";
import { slim } from "@/lib/slim";
import { Card, Chip, N, Notice, PageHeader } from "@/components/ui";
import { LinesChart } from "@/components/charts";
import { TagEditor } from "@/components/TagEditor";
import { PostRows } from "@/components/PostCard";
import type { Post } from "@/lib/analytics/types";

export const dynamic = "force-dynamic";
const merge = (a: string[], b: string[]) => [...new Set([...a, ...b])];

function Metric({ label, value, sub, missing }: { label: string; value: number | null; sub?: string; missing?: string }) {
  return (
    <div className="card card-pad" title={value === null ? missing : undefined}>
      <div className="label">{label}</div>
      <div className={`num mt-1 text-xl font-semibold ${value === null ? "text-muted" : "text-ink"}`}>{fmtInt(value)}</div>
      <div className="mt-0.5 text-[11px] text-muted">{value === null ? missing ?? "Not available from X" : sub}</div>
    </div>
  );
}

export default async function PostDetail({ params }: { params: Promise<{ id: string }> }) {
  const id = Number((await params).id);
  const ds = getDataset();
  const post = ds.posts.find((p) => p.id === id);
  if (!post) notFound();
  const snaps = getSnapshots(id);
  const tags = tagValues(ds.originals);
  const s = post.score;

  // Baselines: the 30 days before this post, and all other original posts.
  const before = ds.originals.filter((p) => p.id !== post.id && p.localDate < post.localDate && p.localDate >= addDays(post.localDate, -30));
  const others = ds.originals.filter((p) => p.id !== post.id);
  const rates: { label: string; key: keyof Post; digits: number }[] = [
    { label: "Engagement rate", key: "engagement_rate", digits: 2 },
    { label: "Like rate", key: "like_rate", digits: 2 },
    { label: "Reply rate", key: "reply_rate", digits: 3 },
    { label: "Repost rate", key: "repost_rate", digits: 3 },
    { label: "Quote rate", key: "quote_rate", digits: 3 },
    { label: "Bookmark rate", key: "bookmark_rate", digits: 3 },
    { label: "Profile visit rate", key: "profile_visit_rate", digits: 3 },
    { label: "Link click rate", key: "link_click_rate", digits: 3 },
  ];
  const impPct = percentileRank(others.map((p) => p.impressions), post.impressions);
  const med30 = median(before.map((p) => p.impressions));

  const similar = post.isOriginal
    ? ds.originals.filter((p) => p.id !== post.id && p.topic === post.topic && p.format === post.format && !!post.topic)
    : [];
  const similarMedian = median(similar.map((p) => p.impressions));

  const curve = snaps.filter((x) => x.impressions !== null).map((x) => {
    const h = (Date.parse(x.captured_at) - Date.parse(post.created_at)) / 3600000;
    return { label: h < 72 ? `${h.toFixed(1)}h` : `${(h / 24).toFixed(1)}d`, impressions: x.impressions, note: `Captured ${formatDateTime(x.captured_at)}` };
  });
  const quartiles = [post.playback_0, post.playback_25, post.playback_50, post.playback_75, post.playback_100];
  const privMissing = post.kind === "repost" ? "Not reported for reposts" : "X returns this only for recent posts (about 30 days)";

  return (
    <>
      <div className="mb-3 text-xs"><Link href="/posts" className="link">&larr; All posts</Link></div>
      <PageHeader title={post.article_title ?? "Post"} subtitle={<>{formatDateTime(post.created_at)} (Europe/Warsaw) &middot; {post.dowName} &middot; {post.bucket} slot &middot; last synced {formatDateTime(post.last_synced_at)}</>}>
        <a href={post.url} target="_blank" rel="noreferrer" className="btn">Open on X &#8599;</a>
      </PageHeader>

      {!post.isOriginal && <div className="mb-4"><Notice>This is a {post.kind}. Replies and reposts are stored but not included in baselines, scores or reports.</Notice></div>}
      {post.maturing && <div className="mb-4"><Notice tone="warn">Published {Math.max(0, Math.round(post.ageHours))}h before the last sync. Numbers are still accumulating - comparisons against older posts understate this one.</Notice></div>}
      {post.missing_since && <div className="mb-4"><Notice tone="warn">X stopped returning this post on {formatDateTime(post.missing_since)} (deleted or unavailable). Its stored history is kept.</Notice></div>}
      {post.impressions === null && post.kind !== "repost" && <div className="mb-4"><Notice tone="warn">X did not return an impression count for this post, so rates and scores cannot be calculated.</Notice></div>}

      <div className="grid gap-4 xl:grid-cols-[minmax(0,1fr)_minmax(0,1fr)]">
        <Card title="Post" action={<span className="flex flex-wrap justify-end gap-1">
          <Chip>{post.kind}{post.is_self_quote ? " of own post" : ""}</Chip>
          {post.format && <Chip>{post.format}</Chip>}
          {post.video_duration_ms !== null && <Chip>{fmtDuration(post.video_duration_ms)} video</Chip>}
          {post.quoted_is_article ? <Chip>quotes own article</Chip> : null}
          {post.has_link ? <Chip>external link</Chip> : null}
        </span>}>
          <div className="max-h-[360px] overflow-y-auto whitespace-pre-wrap break-words text-[13px] leading-6 text-ink2">{post.text}</div>
          {post.externalUrls.length > 0 && (
            <div className="mt-3 border-t border-line pt-3 text-xs text-muted">Links: {post.externalUrls.map((u) => <a key={u} href={u} target="_blank" rel="noreferrer" className="link mr-2 break-all">{u}</a>)}</div>
          )}
        </Card>

        <div className="space-y-4">
          <Card title="Tags" subtitle="Used for every content breakdown. Type any value to create a new tag.">
            {post.kind === "repost" ? <div className="text-xs text-muted">Reposts are not tagged.</div> : (
              <TagEditor postId={post.id} source={post.class_source}
                initial={{ topic: post.topic ?? "", subtopic: post.subtopic ?? "", content_type: post.content_type ?? "", hook_type: post.hook_type ?? "", format: post.format ?? "", is_news: post.is_news === null ? null : !!post.is_news }}
                options={{ topic: merge(DEFAULT_TOPICS, tags.topic), subtopic: tags.subtopic, content_type: merge(DEFAULT_CONTENT_TYPES, tags.content_type), hook_type: merge(DEFAULT_HOOK_TYPES, tags.hook_type), format: merge(DEFAULT_FORMATS, tags.format) }} />
            )}
          </Card>

          {s ? (
            <Card title="Scores" subtitle={`Relative to ${s.referenceKind === "trailing-90d" ? "your posts from the 90 days before this one" : "all your other posts"}.`} action={<N n={s.referenceN} />}>
              <div className="grid grid-cols-2 gap-4">
                <div>
                  <div className="label">Distribution score</div>
                  <div className="num mt-1 text-2xl font-semibold">{Math.round(s.distribution)}<span className="text-sm font-normal text-muted"> / 100</span></div>
                  <div className="mt-1 text-xs leading-4 text-muted">Reach percentile. Expected range {fmtCompact(s.expectedLow)}-{fmtCompact(s.expectedHigh)} (25th-75th pct.), actual {fmtCompact(post.impressions)}.</div>
                </div>
                <div>
                  <div className="label">Engagement quality</div>
                  <div className="num mt-1 text-2xl font-semibold">{s.quality === null ? DASH : Math.round(s.quality)}<span className="text-sm font-normal text-muted"> / 100</span></div>
                  <div className="mt-1 text-xs leading-4 text-muted">Mean percentile of {s.qualityComponents.length} per-impression rate{s.qualityComponents.length === 1 ? "" : "s"}, equally weighted.</div>
                </div>
              </div>
              {s.qualityComponents.length > 0 && (
                <div className="mt-3 flex flex-wrap gap-1.5">
                  {s.qualityComponents.map((c) => <span key={c.key} className="chip" title={`Reference median ${fmtRate(c.referenceMedian, 3)}`}>{c.label} {fmtRate(c.value, c.value < 0.001 ? 3 : 2)} &middot; {fmtPercentile(c.percentile)} pct.</span>)}
                </div>
              )}
              <p className="mt-3 border-t border-line pt-3 text-[13px] leading-5 text-ink2">{s.diagnosis}</p>
              {s.outlier && <p className={`mt-1 text-xs ${s.outlier === "below" ? "text-bad" : "text-good"}`}>{s.outlier === "below" ? "▼ Outlier below baseline" : s.outlier === "far_above" ? "▲ Outlier far above baseline" : "▲ Outlier above baseline"} (robust z = {s.robustZ?.toFixed(1)}).</p>}
            </Card>
          ) : post.isOriginal ? (
            <Notice>Not scored: {post.impressions === null ? "no impression count." : "fewer than 8 comparable posts in the history."}</Notice>
          ) : null}
        </div>
      </div>

      <div className="mt-4 grid grid-cols-2 gap-3 md:grid-cols-4 xl:grid-cols-7">
        <Metric label="Impressions" value={post.impressions} sub={post.organic_impressions !== null ? `${fmtInt(post.organic_impressions)} organic` : "public count"} missing={post.kind === "repost" ? "Not reported for reposts" : undefined} />
        <Metric label="Likes" value={post.likes} sub={fmtRate(post.like_rate) + " of impressions"} />
        <Metric label="Replies" value={post.replies} sub={fmtRate(post.reply_rate, 3) + " of impressions"} />
        <Metric label="Reposts" value={post.reposts} sub={`${fmtInt(post.quotes)} quotes`} />
        <Metric label="Bookmarks" value={post.bookmarks} sub={fmtRate(post.bookmark_rate, 3) + " of impressions"} />
        <Metric label="Profile visits" value={post.profile_visits} sub={fmtRate(post.profile_visit_rate, 3) + " of impressions"} missing={privMissing} />
        <Metric label="Link clicks" value={post.link_clicks} sub={fmtRate(post.link_click_rate, 3) + " of impressions"} missing={post.non_public_available ? "X reports this only for posts with a clickable link" : privMissing} />
      </div>

      <div className="mt-4 grid gap-4 xl:grid-cols-2">
        <Card title="Rates against your baseline" subtitle={`30-day baseline = your original posts from the 30 days before this one.`} action={<N n={before.length} />} pad={false}>
          <table className="w-full">
            <thead className="border-b border-line"><tr>
              <th className="th">Rate</th><th className="th text-right">This post</th><th className="th text-right">30-day median</th><th className="th text-right">Multiple</th><th className="th text-right">Percentile (all time)</th>
            </tr></thead>
            <tbody>
              {rates.map((r) => {
                const v = post[r.key] as number | null;
                const m = median(before.map((p) => p[r.key] as number | null));
                const refs = others.map((p) => p[r.key] as number | null);
                const pct = percentileRank(refs, v);
                return (
                  <tr key={r.label} className="border-b border-line/60 last:border-0">
                    <td className="td text-ink">{r.label}</td>
                    <td className="td num text-right font-medium text-ink">{fmtRate(v, r.digits)}</td>
                    <td className="td num text-right">{fmtRate(m, r.digits)}</td>
                    <td className="td num text-right">{v !== null && m ? fmtMultiple(v / m) : DASH}</td>
                    <td className="td num text-right">{fmtPercentile(pct)}</td>
                  </tr>
                );
              })}
            </tbody>
          </table>
          <div className="space-y-1 border-t border-line px-4 py-3 text-[13px] leading-5 text-ink2">
            {impPct !== null && <p>This post reached the <span className="font-medium text-ink">{fmtPercentile(impPct)} percentile</span> for impressions among your {others.length} other original posts.</p>}
            {med30 !== null && post.impressions !== null && med30 > 0 && <p>Its impressions were <span className="font-medium text-ink">{fmtMultiple(post.impressions / med30)}</span> your 30-day median of {fmtInt(med30)} (n={before.length}).</p>}
            {post.bookmark_rate !== null && median(before.map((p) => p.bookmark_rate)) ? <p>Its bookmark rate was <span className="font-medium text-ink">{fmtMultiple(post.bookmark_rate / (median(before.map((p) => p.bookmark_rate)) as number))}</span> your 30-day median.</p> : null}
            {before.length < 3 && <p className="text-warn">Fewer than 3 posts in the 30-day baseline - treat these multiples as rough.</p>}
          </div>
        </Card>

        <Card title="Growth over time" subtitle="One point per sync. Hours are measured from the moment of publishing." action={<span className="text-[11px] text-muted">{snaps.length} snapshot{snaps.length === 1 ? "" : "s"}</span>}>
          {curve.length >= 2 ? (
            <LinesChart format="compact" series={[{ key: "impressions", label: "Impressions" }]} data={curve} />
          ) : (
            <Notice>Only {curve.length} snapshot so far, so there is no curve to draw yet. Each sync adds a point; run <span className="font-mono text-xs">npm run sync</span> a few times a day for new posts to capture their first 48 hours. Early-hours data for posts published before tracking began was never collected.</Notice>
          )}
          {snaps.length > 0 && (
            <div className="scroll-x mt-3">
              <table className="w-full">
                <thead className="border-b border-line"><tr><th className="th">Captured</th><th className="th text-right">Age</th><th className="th text-right">Impr.</th><th className="th text-right">Likes</th><th className="th text-right">Replies</th><th className="th text-right">Reposts</th><th className="th text-right">Bookm.</th></tr></thead>
                <tbody>
                  {snaps.slice(-8).map((x) => {
                    const h = (Date.parse(x.captured_at) - Date.parse(post.created_at)) / 3600000;
                    return (
                      <tr key={x.id} className="border-b border-line/60 last:border-0">
                        <td className="td num whitespace-nowrap">{formatDateTime(x.captured_at)}{x.source !== "api" && <span className="ml-1 text-[11px] text-muted">({x.source})</span>}</td>
                        <td className="td num text-right">{h < 72 ? `${h.toFixed(1)}h` : `${(h / 24).toFixed(1)}d`}</td>
                        <td className="td num text-right text-ink">{fmtInt(x.impressions)}</td>
                        <td className="td num text-right">{fmtInt(x.likes)}</td><td className="td num text-right">{fmtInt(x.replies)}</td>
                        <td className="td num text-right">{fmtInt(x.reposts)}</td><td className="td num text-right">{fmtInt(x.bookmarks)}</td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          )}
        </Card>
      </div>

      <div className="mt-4 grid gap-4 xl:grid-cols-2">
        {post.mediaTypes.includes("video") && (
          <Card title="Video" subtitle="How far viewers got. X does not report watch time; quartile counts are the closest signal.">
            <div className="num mb-3 flex flex-wrap gap-x-6 gap-y-1 text-[13px] text-ink2">
              <span><span className="text-base font-semibold text-ink">{fmtInt(post.video_views)}</span> video views</span>
              <span><span className="text-base font-semibold text-ink">{fmtRate(post.video_view_rate, 1)}</span> of impressions</span>
              <span><span className="text-base font-semibold text-ink">{fmtRate(post.video_completion_rate, 1)}</span> of starts finished</span>
            </div>
            {post.playback_0 !== null ? (
              <ul className="space-y-1.5">
                {["Started", "25%", "50%", "75%", "100%"].map((l, i) => (
                  <li key={l} className="flex items-center gap-3">
                    <span className="w-14 text-xs text-muted">{l}</span>
                    <span className="h-2 flex-1 rounded-sm bg-raised"><span className="block h-2 rounded-sm bg-accent" style={{ width: `${quartiles[i] !== null && post.playback_0 ? Math.max(((quartiles[i] as number) / post.playback_0) * 100, 0.5) : 0}%` }} /></span>
                    <span className="num w-14 text-right text-xs text-ink2">{fmtInt(quartiles[i])}</span>
                  </li>
                ))}
              </ul>
            ) : <div className="text-xs text-muted">Playback quartiles are not available for this post (X returns them only for recent posts).</div>}
          </Card>
        )}
        {post.isOriginal && (
          <Card title="Similar posts" subtitle={post.topic ? `Same topic (${post.topic}) and format (${post.format}).` : "Tag this post to compare it with similar ones."} action={<N n={similar.length} />}>
            {similar.length > 0 && similarMedian !== null && post.impressions !== null && (
              <p className="mb-3 text-[13px] text-ink2">Median impressions of similar posts: <span className="num font-medium text-ink">{fmtInt(similarMedian)}</span>. This post: <span className="num font-medium text-ink">{fmtInt(post.impressions)}</span>{similarMedian > 0 ? ` (${fmtMultiple(post.impressions / similarMedian)})` : ""}.</p>
            )}
            <PostRows posts={similar.slice(0, 5).map((p) => slim(p))} />
            {similar.length > 5 && <div className="mt-3 text-right text-xs"><Link className="link" href={`/posts?topic=${encodeURIComponent(post.topic ?? "")}&format=${encodeURIComponent(post.format ?? "")}`}>See all {similar.length}</Link></div>}
          </Card>
        )}
      </div>
    </>
  );
}
