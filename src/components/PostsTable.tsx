"use client";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useMemo, useState } from "react";
import { fmtInt, fmtRate } from "@/lib/format";
import { shortDate } from "@/lib/time";
import type { SlimPost } from "@/lib/slim";
import { SERIES } from "@/lib/classify/rules";
import { useUrlState, UrlTabs } from "./filters";
import { HideButton } from "./HideButton";

type SortKey = "date" | "rank" | "firstHour" | "series" | "impressions" | "likes" | "replies" | "reposts" | "bookmarks" | "profileVisits" | "er" | "distribution" | "quality" | "format";
const pick: Record<SortKey, (p: SlimPost, rates: boolean) => number | string | null> = {
  date: (p) => p.createdAt,
  rank: (p) => (p.rank === null ? null : -p.rank),
  firstHour: (p) => p.firstHour ?? null,
  series: (p) => p.series,
  impressions: (p) => p.impressions,
  likes: (p, r) => (r ? p.likeRate : p.likes),
  replies: (p, r) => (r ? p.replyRate : p.replies),
  reposts: (p, r) => (r ? p.repostRate : p.reposts),
  bookmarks: (p, r) => (r ? p.bookmarkRate : p.bookmarks),
  profileVisits: (p, r) => (r ? p.profileVisitRate : p.profileVisits),
  er: (p) => p.engagementRate,
  distribution: (p) => p.distribution,
  quality: (p) => p.quality,
  format: (p) => p.format,
};

/** Inline format picker: saves right away as the owner's choice (same as the post page). */
function FormatSelect({ post }: { post: SlimPost }) {
  const router = useRouter();
  const [value, setValue] = useState(post.series ?? "");
  const [state, setState] = useState<"idle" | "saving" | "error">("idle");
  async function save(v: string) {
    const prev = value;
    setValue(v);
    setState("saving");
    try {
      const res = await fetch(`/api/posts/${post.id}`, { method: "PATCH", headers: { "content-type": "application/json" }, body: JSON.stringify({ series: v }) });
      if (!res.ok) throw new Error();
      setState("idle");
      router.refresh();
    } catch {
      setValue(prev);
      setState("error");
    }
  }
  const title = state === "error" ? "Could not save - try again" : post.seriesSource === "manual" ? "Your choice" : "Detected automatically from the headline - pick to correct";
  return (
    <select aria-label="Format" title={title} value={value} disabled={state === "saving"} onChange={(e) => void save(e.target.value)}
      className={`h-7 cursor-pointer rounded-control border bg-transparent px-1.5 text-[13px] outline-none transition-colors hover:border-line-strong focus:border-ink2 ${state === "error" ? "border-bad text-bad" : "border-transparent"} ${value === "Other" ? "text-muted" : "text-ink2"}`}>
      {!SERIES.includes(value as (typeof SERIES)[number]) && <option value={value}>{value || "—"}</option>}
      {SERIES.map((s) => <option key={s} value={s}>{s}</option>)}
    </select>
  );
}

/** `hideable` adds a last column with a hide (or restore, for hidden posts) button per row. */
export function PostsTable({ posts, compact = false, hideable = false }: { posts: SlimPost[]; compact?: boolean; hideable?: boolean }) {
  const router = useRouter();
  const { params, set } = useUrlState();
  const sort = (params.get("sort") as SortKey) in pick ? (params.get("sort") as SortKey) : "date";
  const dir = params.get("dir") === "asc" ? 1 : -1;
  const rates = params.get("view") === "rates";

  const sorted = useMemo(() => {
    const get = pick[sort];
    return [...posts].sort((a, b) => {
      const va = get(a, rates), vb = get(b, rates);
      if (va === null && vb === null) return 0;
      if (va === null) return 1; // missing values always last
      if (vb === null) return -1;
      return (va < vb ? -1 : va > vb ? 1 : 0) * dir;
    });
  }, [posts, sort, dir, rates]);

  const head = (key: SortKey, label: string, right = true, title?: string) => (
    <th className={`th ${right ? "text-right" : ""}`} title={title} aria-sort={sort === key ? (dir === 1 ? "ascending" : "descending") : "none"}>
      <button type="button" className={`inline-flex items-center gap-1 hover:text-ink ${sort === key ? "text-ink" : ""}`}
        onClick={() => set({ sort: key === "date" ? null : key, dir: sort === key && dir === -1 ? "asc" : null })}>
        {label}
        <span aria-hidden className="text-[9px]">{sort === key ? (dir === 1 ? "▲" : "▼") : ""}</span>
      </button>
    </th>
  );
  const cell = (raw: number | null, rate: number | null) => (rates ? fmtRate(rate, 2) : fmtInt(raw));

  return (
    <div>
      {!compact && (
        <div className="flex items-center justify-between border-b border-line px-4 py-2.5">
          <span className="text-xs text-muted">Click a column to sort, a row to open the post.</span>
          <UrlTabs param="view" fallback="raw" options={[{ key: "raw", label: "Counts" }, { key: "rates", label: "Rates per impression" }]} />
        </div>
      )}
      <div className="scroll-x">
        <table className="w-full min-w-[980px] border-collapse">
          <thead className="border-b border-line">
            <tr>
              {head("rank", "#", false, "Rank by impressions among all your original posts")}
              {head("date", "Date", false)}
              <th className="th">Post</th>
              {head("series", "Format", false, "Your content format: Animated file, Animated scene or Other")}
              {head("firstHour", "1h", true, "Impressions after the first hour (only when a sync captured it; ≈ = interpolated)")}
              {head("impressions", "Impr.")}
              {head("likes", "Likes")}
              {head("er", "Eng. rate", true, "(likes + replies + reposts + quotes + bookmarks) / impressions")}
              {head("distribution", "Dist.", true, "Distribution score: reach percentile vs your own baseline (0-100)")}
              {head("quality", "Qual.", true, "Engagement quality score: mean percentile of per-impression rates (0-100)")}
              {hideable && <th className="th w-10"><span className="sr-only">Hide</span></th>}
            </tr>
          </thead>
          <tbody>
            {sorted.map((p) => (
              <tr key={p.id} onClick={() => router.push(`/posts/${p.id}`)} className="cursor-pointer border-b border-line/60 transition-colors last:border-0 hover:bg-raised/60">
                <td className="td num text-muted">{p.rank ?? "—"}</td>
                <td className="td num whitespace-nowrap text-muted">
                  <span className="text-ink2">{shortDate(p.localDate)}</span> {p.localTime}
                </td>
                <td className="td w-[30%] min-w-[300px]">
                  <div className="flex items-center gap-3">
                    {p.mediaPreview
                      // eslint-disable-next-line @next/next/no-img-element
                      ? <img src={p.mediaPreview} alt="" loading="lazy" className="aspect-video w-24 shrink-0 rounded-[6px] border border-line object-cover" />
                      : <div aria-hidden className="hatch aspect-video w-24 shrink-0 rounded-[6px] border border-line bg-sunken" />}
                    <div className="min-w-0">
                  <Link href={`/posts/${p.id}`} className="line-clamp-1 text-ink hover:underline" title={p.preview} onClick={(e) => e.stopPropagation()}>{p.preview}</Link>
                  <span className="mt-1 flex flex-wrap gap-1">
                    {p.kind !== "post" && p.kind !== "quote" && <span className="chip">{p.kind}</span>}
                    {p.maturing && <span className="chip border-good/40 bg-good/10 text-good" title="Published less than 48h before the last sync - numbers are still growing">new</span>}
                    {p.outlier && <span className={`chip ${p.outlier === "below" ? "border-bad/40 text-bad" : "border-good/40 text-good"}`}>{p.outlier === "below" ? "▼ below baseline" : p.outlier === "far_above" ? "▲ far above baseline" : "▲ above baseline"}</span>}
                  </span>
                    </div>
                  </div>
                </td>
                <td className="td whitespace-nowrap" onClick={(e) => e.stopPropagation()}><FormatSelect post={p} /></td>
                <td className="td num text-right">{p.firstHour === null || p.firstHour === undefined ? <span className="text-muted">—</span> : `${p.firstHourEstimated ? "≈" : ""}${fmtInt(p.firstHour)}`}</td>
                <td className="td num text-right font-medium text-ink">{fmtInt(p.impressions)}</td>
                <td className="td num text-right">{cell(p.likes, p.likeRate)}</td>
                <td className="td num text-right">{fmtRate(p.engagementRate)}</td>
                <td className="td num text-right">{p.distribution === null ? "—" : Math.round(p.distribution)}</td>
                <td className="td num text-right">{p.quality === null ? "—" : Math.round(p.quality)}</td>
                {hideable && <td className="td py-0 text-right" onClick={(e) => e.stopPropagation()}><HideButton postId={p.id} hidden={p.hidden} variant="icon" /></td>}
              </tr>
            ))}
            {!sorted.length && (
              <tr><td colSpan={hideable ? 11 : 10} className="px-4 py-10 text-center text-[13px] text-muted">No posts match these filters.</td></tr>
            )}
          </tbody>
        </table>
      </div>
    </div>
  );
}
