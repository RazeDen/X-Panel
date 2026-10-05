import Link from "next/link";
import { fmtCompact, fmtDelta, fmtPercentile, fmtRate } from "@/lib/format";
import { shortDate } from "@/lib/time";
import type { SlimPost } from "@/lib/slim";

/** Compact post summary used in highlight tiles and ranked lists. */
export function PostCard({ label, post, detail, tone }: { label?: string; post: SlimPost | null; detail?: string; tone?: "good" | "bad" }) {
  return (
    <div className="card card-pad flex flex-col">
      {label && <div className="label mb-2">{label}</div>}
      {!post ? (
        <div className="py-3 text-xs text-muted">Nothing in this range.</div>
      ) : (
        <>
          <Link href={`/posts/${post.id}`} className="line-clamp-3 text-[13px] leading-5 text-ink hover:underline">{post.preview}</Link>
          <div className="num mt-2 flex flex-wrap items-baseline gap-x-3 gap-y-0.5 text-xs text-muted">
            <span><span className="text-base font-semibold text-ink">{fmtCompact(post.impressions)}</span> impressions</span>
            <span>{fmtRate(post.engagementRate)} eng. rate</span>
          </div>
          <div className="mt-1 text-xs text-muted">
            {shortDate(post.localDate)} {post.localTime}
            {[post.topic, post.format, post.hook].filter(Boolean).length > 0 && <> &middot; {[post.topic, post.format, post.hook].filter(Boolean).join(" · ")}</>}
          </div>
          {detail && <div className={`mt-2 text-xs ${tone === "good" ? "text-good" : tone === "bad" ? "text-bad" : "text-ink2"}`}>{detail}</div>}
          {post.maturing && <div className="mt-1 text-[11px] text-warn">Under 48h old at the last sync - still accumulating.</div>}
        </>
      )}
    </div>
  );
}

export function PostRows({ posts, metric = "impressions" }: { posts: SlimPost[]; metric?: "impressions" | "lift" }) {
  if (!posts.length) return <div className="py-4 text-center text-xs text-muted">None.</div>;
  return (
    <ul className="divide-y divide-line/60">
      {posts.map((p) => (
        <li key={p.id} className="flex items-start justify-between gap-4 py-2.5 first:pt-0 last:pb-0">
          <div className="min-w-0">
            <Link href={`/posts/${p.id}`} className="line-clamp-2 text-[13px] leading-5 text-ink hover:underline">{p.preview}</Link>
            <div className="mt-0.5 text-xs text-muted">
              {shortDate(p.localDate)} {p.localTime} &middot; {[p.topic, p.format, p.hook].filter(Boolean).join(" · ") || "untagged"}
              {p.maturing && <span className="text-warn"> &middot; &lt;48h old</span>}
            </div>
          </div>
          <div className="num shrink-0 text-right">
            <div className="text-[13px] font-semibold text-ink">{fmtCompact(p.impressions)}</div>
            <div className="text-[11px] text-muted">{metric === "impressions" ? `${fmtRate(p.engagementRate)} ER` : `${fmtPercentile(p.distribution)} pct.`}</div>
          </div>
        </li>
      ))}
    </ul>
  );
}
export { fmtDelta };
