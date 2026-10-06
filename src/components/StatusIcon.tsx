import type { statusOf } from "@/lib/analytics/growth";

type S = ReturnType<typeof statusOf>;

/**
 * YouTube-style verdict next to a metric: green check = within the usual range (25th-75th percentile
 * of the comparison posts), green up arrow = above it, red down arrow = below it. Nothing is shown
 * when there are fewer than 3 comparison posts. The tooltip names the comparison and its sample size.
 */
export function StatusIcon({ s, basis, fmt }: { s: S; basis: string; fmt: (v: number) => string }) {
  if (!s) return <span aria-hidden className="inline-block h-4 w-4" />;
  const label = s.status === "above" ? "Above usual" : s.status === "below" ? "Below usual" : "Within usual range";
  const title = `${label}: usual range ${fmt(s.low)}-${fmt(s.high)} (${basis}, n=${s.n})`;
  if (s.status === "typical") {
    return (
      <svg role="img" aria-label={title} viewBox="0 0 16 16" className="h-4 w-4 shrink-0 text-good"><title>{title}</title>
        <circle cx="8" cy="8" r="6.6" fill="none" stroke="currentColor" strokeWidth="1.5" />
        <path d="m5.2 8.2 1.9 1.9 3.8-3.9" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" />
      </svg>
    );
  }
  const up = s.status === "above";
  return (
    <svg role="img" aria-label={title} viewBox="0 0 16 16" className={`h-4 w-4 shrink-0 ${up ? "text-good" : "text-bad"}`}><title>{title}</title>
      <circle cx="8" cy="8" r="7.3" fill="currentColor" />
      <path d={up ? "M8 11.5v-7M5 7.2l3-3 3 3" : "M8 4.5v7M5 8.8l3 3 3-3"} fill="none" stroke="#000" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round" />
    </svg>
  );
}
