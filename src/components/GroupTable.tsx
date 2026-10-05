"use client";
import Link from "next/link";
import { useMemo, useState } from "react";
import type { GroupRow } from "@/lib/analytics/types";
import { fmtInt, fmtRate } from "@/lib/format";
import { N } from "./ui";

type Key = "key" | "n" | "medianImpressions" | "avgImpressions" | "totalImpressions" | "medianEngagementRate" | "medianBookmarkRate" | "medianRepostRate" | "medianReplyRate" | "medianLikeRate" | "medianDistribution" | "medianQuality";
const COLS: { key: Key; label: string; title?: string; fmt: (r: GroupRow) => string }[] = [
  { key: "medianImpressions", label: "Median impr.", fmt: (r) => fmtInt(r.medianImpressions) },
  { key: "avgImpressions", label: "Avg impr.", fmt: (r) => fmtInt(r.avgImpressions) },
  { key: "medianEngagementRate", label: "Median ER", fmt: (r) => fmtRate(r.medianEngagementRate) },
  { key: "medianLikeRate", label: "Like rate", fmt: (r) => fmtRate(r.medianLikeRate) },
  { key: "medianBookmarkRate", label: "Bookmark rate", fmt: (r) => fmtRate(r.medianBookmarkRate, 3) },
  { key: "medianRepostRate", label: "Repost rate", fmt: (r) => fmtRate(r.medianRepostRate, 3) },
  { key: "medianReplyRate", label: "Reply rate", fmt: (r) => fmtRate(r.medianReplyRate, 3) },
  { key: "medianDistribution", label: "Dist.", title: "Median distribution score (0-100)", fmt: (r) => (r.medianDistribution === null ? "—" : String(Math.round(r.medianDistribution))) },
  { key: "medianQuality", label: "Qual.", title: "Median engagement quality score (0-100)", fmt: (r) => (r.medianQuality === null ? "—" : String(Math.round(r.medianQuality))) },
];

/** Sortable breakdown table. Rates are medians of per-post rates; the sample size is on every row. */
export function GroupTable({ rows, label, hrefFor, initialSort = "medianImpressions", keepOrder = false }: {
  rows: GroupRow[]; label: string; hrefFor?: Record<string, string>; initialSort?: Key; keepOrder?: boolean;
}) {
  const [sort, setSort] = useState<Key | null>(keepOrder ? null : initialSort);
  const [dir, setDir] = useState<1 | -1>(-1);
  const sorted = useMemo(() => {
    if (!sort) return rows;
    return [...rows].sort((a, b) => {
      const va = a[sort], vb = b[sort];
      if (va === null && vb === null) return 0;
      if (va === null) return 1;
      if (vb === null) return -1;
      return (va < vb ? -1 : va > vb ? 1 : 0) * dir;
    });
  }, [rows, sort, dir]);
  const click = (k: Key) => {
    if (sort === k) setDir(dir === 1 ? -1 : 1);
    else { setSort(k); setDir(k === "key" ? 1 : -1); }
  };
  const th = (k: Key, text: string, right = true, title?: string) => (
    <th key={k} className={`th ${right ? "text-right" : ""}`} title={title}>
      <button type="button" onClick={() => click(k)} className={`inline-flex items-center gap-1 uppercase tracking-wider hover:text-ink ${sort === k ? "text-ink" : ""}`}>
        {text}<span aria-hidden className="text-[9px]">{sort === k ? (dir === 1 ? "▲" : "▼") : ""}</span>
      </button>
    </th>
  );
  if (!rows.length) return <div className="px-4 py-8 text-center text-[13px] text-muted">No posts in this range.</div>;
  return (
    <div className="scroll-x">
      <table className="w-full min-w-[860px]">
        <thead className="border-b border-line">
          <tr>
            {th("key", label, false)}
            {th("n", "Posts")}
            {COLS.map((c) => th(c.key, c.label, true, c.title))}
          </tr>
        </thead>
        <tbody>
          {sorted.map((r) => (
            <tr key={r.key} className={`border-b border-line/60 last:border-0 ${r.lowSample ? "opacity-60" : ""}`}>
              <td className="td whitespace-nowrap text-ink">
                {hrefFor?.[r.key] ? <Link href={hrefFor[r.key]} className="hover:underline">{r.key}</Link> : r.key}
              </td>
              <td className="td text-right"><N n={r.n} /></td>
              {COLS.map((c) => <td key={c.key} className={`td num text-right ${c.key === "medianImpressions" ? "font-medium text-ink" : ""}`}>{c.fmt(r)}</td>)}
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}
