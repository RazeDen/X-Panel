import Link from "next/link";
import { N } from "./ui";

export interface HBarRow { key: string; value: number | null; display: string; n: number; href?: string; sub?: string }

/** Ranked horizontal bars with the sample size on every row. Low-sample rows are dimmed, never hidden. */
export function HBars({ rows, empty = "No posts in this range" }: { rows: HBarRow[]; empty?: string }) {
  if (!rows.length) return <div className="py-6 text-center text-xs text-muted">{empty}</div>;
  const max = Math.max(...rows.map((r) => r.value ?? 0), 0);
  return (
    <ul className="space-y-2">
      {rows.map((r) => {
        const pct = max > 0 && r.value !== null ? Math.max((r.value / max) * 100, 1.5) : 0;
        const low = r.n < 3;
        const body = (
          <div className={`group ${low ? "opacity-60" : ""}`}>
            <div className="flex items-baseline justify-between gap-3">
              <span className="truncate text-[13px] text-ink2 group-hover:text-ink">{r.key}</span>
              <span className="flex shrink-0 items-baseline gap-2">
                <N n={r.n} />
                <span className="num text-[13px] font-medium text-ink">{r.display}</span>
              </span>
            </div>
            <div className="mt-1 h-1.5 w-full rounded-sm bg-raised">
              <div className="h-1.5 rounded-sm bg-accent" style={{ width: `${pct}%` }} />
            </div>
            {r.sub && <div className="mt-0.5 text-[11px] text-muted">{r.sub}</div>}
          </div>
        );
        return <li key={r.key}>{r.href ? <Link href={r.href}>{body}</Link> : body}</li>;
      })}
    </ul>
  );
}
