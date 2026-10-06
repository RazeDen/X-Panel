import Link from "next/link";
import type { RecentCard } from "@/lib/analytics/growth";
import { ageLabel } from "@/lib/analytics/growth";
import { fmtCompact, fmtInt, fmtRate, preview, DASH } from "@/lib/format";
import { StatusIcon } from "./StatusIcon";

/**
 * YouTube Studio's "Latest video performance" for X posts: preview, headline counters, age,
 * rank among the last 10 posts and per-metric verdicts. Pages through the last 10 posts with
 * links (hrefFor builds the URL for another index), so it works without client JavaScript.
 */
const Icon = ({ d }: { d: string }) => (
  <svg viewBox="0 0 24 24" className="h-4 w-4" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" aria-hidden><path d={d} /></svg>
);
const EYE = "M2 12s3.6-7 10-7 10 7 10 7-3.6 7-10 7S2 12 2 12zM12 15a3 3 0 1 0 0-6 3 3 0 0 0 0 6z";
const HEART = "M12 20s-7.5-4.6-9.3-9.2C1.4 7.4 3.6 4 7 4c2.1 0 3.6 1.2 5 3 1.4-1.8 2.9-3 5-3 3.4 0 5.6 3.4 4.3 6.8C19.5 15.4 12 20 12 20z";
const BUBBLE = "M4 5h16v11H9l-5 4z";
const BOOKMARK = "M6 3h12v18l-6-4.5L6 21z";

export function LatestPostCard({ card, hrefFor }: { card: RecentCard; hrefFor: (index: number) => string }) {
  const p = card.post;
  const fh = card.firstHour.value;
  const Row = ({ label, children }: { label: string; children: React.ReactNode }) => (
    <div className="flex items-center justify-between gap-3 py-1.5 text-[13px]">
      <span className="text-ink2">{label}</span>
      <span className="num flex items-center gap-2 text-ink">{children}</span>
    </div>
  );
  return (
    <section className="card flex flex-col">
      <header className="px-5 pt-5">
        <h2 className="text-[14px] font-semibold text-ink">{card.index === 0 ? "Latest post performance" : "Recent post performance"}</h2>
      </header>
      <div className="px-5 pt-4">
        <Link href={`/posts/${p.id}`} className="group relative block overflow-hidden rounded-[8px] border border-line">
          {p.media_preview ? (
            // eslint-disable-next-line @next/next/no-img-element
            <img src={p.media_preview} alt="" className="aspect-video w-full object-cover transition-opacity group-hover:opacity-90" />
          ) : (
            <div className="hatch aspect-video w-full bg-sunken" />
          )}
          <div className="absolute inset-x-0 bottom-0 bg-gradient-to-t from-black/90 via-black/60 to-transparent px-3 pb-2.5 pt-8">
            <p className="line-clamp-2 text-[13px] font-semibold leading-[18px] text-white">{preview(p.article_title || p.text, 120)}</p>
          </div>
          {p.series && p.series !== "Other" && <span className="chip absolute left-2 top-2 bg-black/70 text-white">{p.series}</span>}
        </Link>
        <div className="num mt-3 flex items-center gap-5 text-[13px] text-ink2">
          <span className="inline-flex items-center gap-1.5" title="Impressions"><Icon d={EYE} />{fmtCompact(p.impressions)}</span>
          <span className="inline-flex items-center gap-1.5" title="Likes"><Icon d={HEART} />{fmtCompact(p.likes)}</span>
          <span className="inline-flex items-center gap-1.5" title="Replies"><Icon d={BUBBLE} />{fmtCompact(p.replies)}</span>
          <span className="inline-flex items-center gap-1.5" title="Bookmarks"><Icon d={BOOKMARK} />{fmtCompact(p.bookmarks)}</span>
        </div>
      </div>
      <div className="mx-5 mt-4 border-t border-line pt-3">
        <div className="mb-1 text-[12px] text-muted" title="Age of the post at the last sync">{ageLabel(card.ageHours)}{p.maturing ? " · still growing" : ""}</div>
        <Row label="Ranking by impressions">
          {card.rank ? <span title={card.rank.sameAge ? "Among recent posts at the same age" : "By total impressions - older posts have had more time"}>{card.rank.rank} of {card.rank.of}{!card.rank.sameAge && <span className="ml-1 text-[11px] text-muted">total</span>}</span> : DASH}
        </Row>
        <Row label="Impressions">{fmtInt(card.impressions.value)}<StatusIcon s={card.impressions.status} basis={card.impressions.basis} fmt={fmtCompact} /></Row>
        <Row label="First hour">
          {fh ? <span title={fh.estimated ? "Estimated between two snapshots around the 1-hour mark" : `Measured at ${Math.round(fh.atHours * 60)} min`}>{fh.estimated ? "≈" : ""}{fmtInt(fh.value)}</span> : <span className="text-muted" title="No snapshot was taken near the first hour of this post">not captured</span>}
          <StatusIcon s={card.firstHour.status} basis="first hour of recent posts" fmt={fmtCompact} />
        </Row>
        <Row label="Engagement rate">{fmtRate(card.engagementRate.value)}<StatusIcon s={card.engagementRate.status} basis="recent posts" fmt={(v) => fmtRate(v)} /></Row>
        <Row label="Bookmark rate">{fmtRate(card.bookmarkRate.value)}<StatusIcon s={card.bookmarkRate.status} basis="recent posts" fmt={(v) => fmtRate(v)} /></Row>
        <Row label="Distribution score">{p.score ? `${Math.round(p.score.distribution)} / 100` : DASH}<span aria-hidden className="inline-block h-4 w-4" /></Row>
        <div className="mt-3 pb-4">
          <Link href={`/posts/${p.id}`} className="btn">See post analytics</Link>
        </div>
      </div>
      <nav aria-label="Recent posts" className="mt-auto flex items-center justify-between border-t border-line px-3 py-2">
        {card.index < card.total - 1 ? <Link href={hrefFor(card.index + 1)} className="icon-btn" aria-label="Older post">&#8249;</Link> : <span className="h-8 w-8" />}
        <span className="num text-[13px] text-ink2">{card.index + 1} of {card.total}</span>
        {card.index > 0 ? <Link href={hrefFor(card.index - 1)} className="icon-btn" aria-label="Newer post">&#8250;</Link> : <span className="h-8 w-8" />}
      </nav>
    </section>
  );
}
