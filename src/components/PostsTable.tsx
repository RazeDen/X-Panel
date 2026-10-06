"use client";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useMemo } from "react";
import { fmtInt, fmtRate } from "@/lib/format";
import { shortDate } from "@/lib/time";
import type { SlimPost } from "@/lib/slim";
import { useUrlState, UrlTabs } from "./filters";

type SortKey = "date" | "rank" | "firstHour" | "series" | "impressions" | "likes" | "replies" | "reposts" | "bookmarks" | "profileVisits" | "er" | "distribution" | "quality" | "topic" | "format" | "hook";
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
  topic: (p) => p.topic,
  format: (p) => p.format,
  hook: (p) => p.hook,
};

export function PostsTable({ posts, compact = false }: { posts: SlimPost[]; compact?: boolean }) {
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
        <table className="w-full min-w-[1280px] border-collapse">
          <thead className="border-b border-line">
            <tr>
              {head("rank", "#", false, "Rank by impressions among all your original posts")}
              {head("date", "Date", false)}
              <th className="th">Post</th>
              {head("series", "Series", false)}
              {head("topic", "Topic", false)}
              {head("format", "Format", false)}
              {head("hook", "Hook", false)}
              {head("firstHour", "1h", true, "Impressions after the first hour (only when a sync captured it; ≈ = interpolated)")}
              {head("impressions", "Impr.")}
              {head("likes", "Likes")}
              {head("replies", "Replies")}
              {head("reposts", "Reposts")}
              {head("bookmarks", "Bookm.")}
              {head("er", "Eng. rate", true, "(likes + replies + reposts + quotes + bookmarks) / impressions")}
              {head("distribution", "Dist.", true, "Distribution score: reach percentile vs your own baseline (0-100)")}
              {head("quality", "Qual.", true, "Engagement quality score: mean percentile of per-impression rates (0-100)")}
            </tr>
          </thead>
          <tbody>
            {sorted.map((p) => (
              <tr key={p.id} onClick={() => router.push(`/posts/${p.id}`)} className="cursor-pointer border-b border-line/60 transition-colors last:border-0 hover:bg-raised/60">
                <td className="td num text-muted">{p.rank ?? "—"}</td>
                <td className="td num whitespace-nowrap text-muted">
                  <span className="text-ink2">{shortDate(p.localDate)}</span> {p.localTime}
                </td>
                <td className="td w-[34%] min-w-[280px]">
                  <Link href={`/posts/${p.id}`} className="line-clamp-2 text-ink hover:underline" onClick={(e) => e.stopPropagation()}>{p.preview}</Link>
                  <span className="mt-0.5 flex flex-wrap gap-1">
                    {p.kind !== "post" && p.kind !== "quote" && <span className="chip">{p.kind}</span>}
                    {p.maturing && <span className="chip border-warn/40 text-warn" title="Published less than 48h before the last sync - numbers still moving">&lt;48h</span>}
                    {p.outlier && <span className={`chip ${p.outlier === "below" ? "border-bad/40 text-bad" : "border-good/40 text-good"}`}>{p.outlier === "below" ? "▼ below baseline" : p.outlier === "far_above" ? "▲ far above baseline" : "▲ above baseline"}</span>}
                  </span>
                </td>
                <td className="td whitespace-nowrap">{p.series && p.series !== "Other" ? p.series : <span className="text-muted">{p.series ?? "—"}</span>}</td>
                <td className="td whitespace-nowrap">{p.topic ?? <span className="text-muted">Untagged</span>}</td>
                <td className="td whitespace-nowrap">{p.format ?? "—"}</td>
                <td className="td whitespace-nowrap">{p.hook ?? <span className="text-muted">—</span>}</td>
                <td className="td num text-right">{p.firstHour === null || p.firstHour === undefined ? <span className="text-muted">—</span> : `${p.firstHourEstimated ? "≈" : ""}${fmtInt(p.firstHour)}`}</td>
                <td className="td num text-right font-medium text-ink">{fmtInt(p.impressions)}</td>
                <td className="td num text-right">{cell(p.likes, p.likeRate)}</td>
                <td className="td num text-right">{cell(p.replies, p.replyRate)}</td>
                <td className="td num text-right">{cell(p.reposts, p.repostRate)}</td>
                <td className="td num text-right">{cell(p.bookmarks, p.bookmarkRate)}</td>
                <td className="td num text-right">{fmtRate(p.engagementRate)}</td>
                <td className="td num text-right">{p.distribution === null ? "—" : Math.round(p.distribution)}</td>
                <td className="td num text-right">{p.quality === null ? "—" : Math.round(p.quality)}</td>
              </tr>
            ))}
            {!sorted.length && (
              <tr><td colSpan={16} className="px-4 py-10 text-center text-[13px] text-muted">No posts match these filters.</td></tr>
            )}
          </tbody>
        </table>
      </div>
    </div>
  );
}
