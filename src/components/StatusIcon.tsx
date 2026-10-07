import type { Verdict } from "@/lib/analytics/growth";

/**
 * YouTube-style verdict next to a metric.
 *  - range verdict (statusOf): green check = within the 25th-75th percentile of the comparison posts,
 *    green up arrow = above it, red down arrow = below it; needs at least 3 comparison posts.
 *  - median verdict (medianVerdict, byMedian): green up / red down = above / below the median of the
 *    comparison posts; shown from n = 1, and with fewer than 3 posts the sample size is printed next to it.
 * The tooltip always names the comparison and its sample size.
 */
export function StatusIcon({ s, basis, fmt }: { s: Verdict | null; basis: string; fmt: (v: number) => string }) {
  if (!s) return <span aria-hidden className="inline-block h-4 w-4" />;
  const title = s.byMedian
    ? `${s.status === "above" ? "Above" : s.status === "below" ? "Below" : "Equal to"} the median of ${basis}: ${fmt(s.low)} (n=${s.n}${s.n < 3 ? ", low sample" : ""})`
    : `${s.status === "above" ? "Above usual" : s.status === "below" ? "Below usual" : "Within usual range"}: usual range ${fmt(s.low)}-${fmt(s.high)} (${basis}, n=${s.n})`;
  const small = s.byMedian && s.n < 3 ? <span className="num text-[10px] text-muted">n={s.n}</span> : null;
  if (s.status === "typical") {
    return (
      <span className="inline-flex items-center gap-1">{small}
        <svg role="img" aria-label={title} viewBox="0 0 16 16" className="h-4 w-4 shrink-0 text-good"><title>{title}</title>
          <circle cx="8" cy="8" r="6.6" fill="none" stroke="currentColor" strokeWidth="1.5" />
          <path d="m5.2 8.2 1.9 1.9 3.8-3.9" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" />
        </svg>
      </span>
    );
  }
  const up = s.status === "above";
  return (
    <span className="inline-flex items-center gap-1">{small}
      <svg role="img" aria-label={title} viewBox="0 0 16 16" className={`h-4 w-4 shrink-0 ${up ? "text-good" : "text-bad"}`}><title>{title}</title>
        <circle cx="8" cy="8" r="7.3" fill="currentColor" />
        <path d={up ? "M8 11.5v-7M5 7.2l3-3 3 3" : "M8 4.5v7M5 8.8l3 3 3-3"} fill="none" stroke="#000" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round" />
      </svg>
    </span>
  );
}
