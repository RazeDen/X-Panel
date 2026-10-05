import Link from "next/link";
import type { Activity, ActivityCell } from "@/lib/analytics/activity";
import { DOW_NAMES, longDate } from "@/lib/time";

/** Calendar heatmap of posts per day. Server-rendered; a coloured cell links to that day's posts. */
const LEVEL_CLS = ["bg-raised", "bg-accent/30", "bg-accent/55", "bg-accent/80", "bg-accent"];

const plural = (n: number) => `${n} post${n === 1 ? "" : "s"}`;

function Cell({ c }: { c: ActivityCell }) {
  if (!c.inPeriod) return <div aria-hidden className="aspect-square" />;
  const label = `${longDate(c.date)}: ${c.count ? plural(c.count) : "no posts"}`;
  const cls = `block aspect-square rounded-[3px] ${LEVEL_CLS[c.level]}`;
  return c.count
    ? <Link href={`/posts?from=${c.date}&to=${c.date}`} title={label} aria-label={label} className={`${cls} hover:ring-1 hover:ring-ink/70`} />
    : <div title={label} className={cls} />;
}

export function Heatmap({ a }: { a: Activity }) {
  const cols = `repeat(${a.weeks.length}, minmax(9px, 1fr))`;
  const [l1, l2, l3, l4] = a.levelMax;
  const range = (lo: number, hi: number) => (lo >= hi ? `${hi}` : `${lo}-${hi}`);
  const legend = ["0", range(1, l1), range(l1 + 1, l2), range(l2 + 1, l3), range(l3 + 1, l4)];
  return (
    <div>
      <div className="scroll-x">
        <div className="min-w-[560px]">
          <div className="grid grid-cols-[28px_1fr] gap-x-2">
            <div />
            <div className="grid h-5 text-[11px] text-muted" style={{ gridTemplateColumns: cols, columnGap: 3 }}>
              {a.months.map((m) => <span key={`${m.col}-${m.label}`} className="whitespace-nowrap" style={{ gridColumnStart: m.col + 1, gridRowStart: 1 }}>{m.label}</span>)}
            </div>
            <div className="grid text-[10px] leading-none text-muted" style={{ gridTemplateRows: "repeat(7, 1fr)", rowGap: 3 }}>
              {DOW_NAMES.map((d, i) => <span key={d} className="flex items-center">{i % 2 === 0 ? d : ""}</span>)}
            </div>
            <div className="grid grid-flow-col" style={{ gridTemplateColumns: cols, gridTemplateRows: "repeat(7, auto)", gap: 3 }}>
              {a.weeks.flatMap((w) => w.map((c) => <Cell key={c.date} c={c} />))}
            </div>
          </div>
        </div>
      </div>
      <div className="mt-3 flex flex-wrap items-center justify-between gap-2 text-[11px] text-muted">
        <span>Each square is one day (Europe/Warsaw). Click a coloured square to open that day&apos;s posts.</span>
        <span className="flex items-center gap-1.5">
          Less
          {LEVEL_CLS.map((cls, i) => <span key={cls} title={`${legend[i]} posts`} className={`inline-block h-[11px] w-[11px] rounded-[3px] ${cls}`} />)}
          More
        </span>
      </div>
    </div>
  );
}
