import Link from "next/link";
import type { RecentCard } from "@/lib/analytics/growth";
import { ageLabel } from "@/lib/analytics/growth";
import { fmtCompact, fmtInt, fmtRate, preview, DASH } from "@/lib/format";
import { StatusIcon } from "./StatusIcon";
import { PostPreview } from "./PostPreview";
import { median } from "@/lib/stats";

/**
 * YouTube Studio's "Latest video performance" for X posts: preview, headline counters, age and
 * per-metric verdicts (no rank row, no bookmark rate - owner's choice). Pages through the last 10 posts with
 * links (hrefFor builds the URL for another index), so it works without client JavaScript.
 */
const Icon = ({ d }: { d: string }) => (
  <svg viewBox="0 0 24 24" className="h-4 w-4" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" aria-hidden><path d={d} /></svg>
);
const EYE = "M2 12s3.6-7 10-7 10 7 10 7-3.6 7-10 7S2 12 2 12zM12 15a3 3 0 1 0 0-6 3 3 0 0 0 0 6z";
const HEART = "M12 20s-7.5-4.6-9.3-9.2C1.4 7.4 3.6 4 7 4c2.1 0 3.6 1.2 5 3 1.4-1.8 2.9-3 5-3 3.4 0 5.6 3.4 4.3 6.8C19.5 15.4 12 20 12 20z";
const BUBBLE = "M4 5h16v11H9l-5 4z";
const BOOKMARK = "M6 3h12v18l-6-4.5L6 21z";

/**
 * First-hour meter: this post's impressions after 1 hour as a bar, against the other recent posts:
 * grey band = their lowest to highest first-hour value, white tick = their median.
 */
function FirstHourMeter({ value, others, ageHours }: { value: RecentCard["firstHour"]["value"]; others: number[]; ageHours: number }) {
  const v = value?.value ?? null;
  const lo = others.length ? Math.min(...others) : null;
  const hi = others.length ? Math.max(...others) : null;
  const med = median(others);
  const max = Math.max(1, v ?? 0, hi ?? 0) * 1.08;
  const pct = (x: number) => `${Math.min((x / max) * 100, 100)}%`;
  const dir = v !== null && med !== null ? (v > med ? "up" : v < med ? "down" : null) : null;
  return (
    <div className="mb-1 mt-2 rounded-[8px] border border-line bg-sunken px-3 py-2.5">
      <div className="flex items-baseline justify-between gap-2 whitespace-nowrap text-[11px] text-muted">
        <span>vs recent posts</span>
        {others.length > 0 && (
          <span className="num" title={others.length < 3 ? "Low sample: fewer than 3 recent posts have a first-hour value" : undefined}>
            median {fmtInt(med)} · <span className={others.length < 3 ? "text-warn" : ""}>n={others.length}</span>
          </span>
        )}
      </div>
      <div className="relative mt-2 h-2.5 w-full rounded-full bg-raised" role="img"
        aria-label={`First hour: ${v === null ? "not captured" : fmtInt(v)}${med !== null ? `, median of ${others.length} recent posts ${fmtInt(med)}` : ""}`}>
        {lo !== null && hi !== null && <div className="absolute inset-y-0 rounded-full bg-line-strong" style={{ left: pct(lo), width: `calc(${pct(hi)} - ${pct(lo)})` }} />}
        {v !== null && <div className={`absolute inset-y-0 left-0 rounded-full ${dir === "down" ? "bg-bad" : "bg-accent"}`} style={{ width: pct(v), opacity: 0.9 }} />}
        {med !== null && <div className="absolute -inset-y-1 w-[2px] rounded-full bg-ink" style={{ left: pct(med) }} title={`Median ${fmtInt(med)}`} />}
      </div>
      <div className="num mt-1.5 flex justify-between text-[11px]">
        <span className={v === null ? "text-muted" : "text-ink"}>
          {v === null ? (ageHours < 1 ? "first hour not reached yet" : "not captured") : <>{value!.estimated ? "≈" : ""}{fmtInt(v)} this post{dir && <span className={dir === "up" ? "text-good" : "text-bad"}> {dir === "up" ? "↑" : "↓"}</span>}</>}
        </span>
        {lo !== null && hi !== null && <span className="text-muted">range {fmtCompact(lo)}-{fmtCompact(hi)}</span>}
      </div>
    </div>
  );
}

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
        <PostPreview id={p.id} image={p.media_preview} text={preview(p.article_title || p.text, 120)} series={p.series} />
        <div className="num mt-3 flex items-center gap-5 text-[13px] text-ink2">
          <span className="inline-flex items-center gap-1.5" title="Impressions"><Icon d={EYE} />{fmtCompact(p.impressions)}</span>
          <span className="inline-flex items-center gap-1.5" title="Likes"><Icon d={HEART} />{fmtCompact(p.likes)}</span>
          <span className="inline-flex items-center gap-1.5" title="Replies"><Icon d={BUBBLE} />{fmtCompact(p.replies)}</span>
          <span className="inline-flex items-center gap-1.5" title="Bookmarks"><Icon d={BOOKMARK} />{fmtCompact(p.bookmarks)}</span>
        </div>
      </div>
      <div className="mx-5 mt-4 border-t border-line pt-3">
        <div className="mb-1 text-[12px] text-muted" title="Age of the post at the last sync">{ageLabel(card.ageHours)}{p.maturing ? " · still growing" : ""}</div>
        <Row label="Impressions">{fmtInt(card.impressions.value)}<StatusIcon s={card.impressions.status} basis={card.impressions.basis} fmt={fmtCompact} /></Row>
        <Row label="First hour">
          {fh ? <span title={fh.estimated ? "Estimated between two snapshots around the 1-hour mark" : `Measured at ${Math.round(fh.atHours * 60)} min`}>{fh.estimated ? "≈" : ""}{fmtInt(fh.value)}</span> : <span className="text-muted" title="No snapshot was taken near the first hour of this post">not captured</span>}
          <StatusIcon s={card.firstHour.status} basis="the other recent posts after 1 hour" fmt={fmtInt} />
        </Row>
        <FirstHourMeter value={card.firstHour.value} others={card.firstHourOthers} ageHours={card.ageHours} />
        <Row label="Engagement rate">{fmtRate(card.engagementRate.value)}<StatusIcon s={card.engagementRate.status} basis={card.engagementRate.basis} fmt={(v) => fmtRate(v)} /></Row>
        <Row label="Distribution score">{p.score ? `${Math.round(p.score.distribution)} / 100` : DASH}<span aria-hidden className="inline-block h-4 w-4" /></Row>
        <div className="pb-3" />
      </div>
      <nav aria-label="Recent posts" className="mt-auto flex items-center justify-between border-t border-line px-3 py-2">
        {card.index < card.total - 1 ? <Link href={hrefFor(card.index + 1)} className="icon-btn" aria-label="Older post">&#8249;</Link> : <span className="h-8 w-8" />}
        <span className="num text-[13px] text-ink2">{card.index + 1} of {card.total}</span>
        {card.index > 0 ? <Link href={hrefFor(card.index - 1)} className="icon-btn" aria-label="Newer post">&#8250;</Link> : <span className="h-8 w-8" />}
      </nav>
    </section>
  );
}
