import Link from "next/link";
import type { ReactNode } from "react";
import { fmtDelta } from "@/lib/format";
import { MIN_SAMPLE } from "@/lib/analytics/types";

/**
 * Page heading in the Developer Console style ("Hello, RazeDen"): medium-weight title, muted subtitle,
 * actions on the right, and an optional underline tab bar (UrlTabs variant="underline") below.
 */
export function PageHeader({ title, subtitle, children, tabs }: { title: string; subtitle?: ReactNode; children?: ReactNode; tabs?: ReactNode }) {
  return (
    <div className="mb-6">
      <div className="flex flex-wrap items-end justify-between gap-3">
        <div className="min-w-0">
          <h1 className="text-[22px] font-medium leading-7 tracking-tight text-ink">{title}</h1>
          {subtitle && <p className="mt-1 max-w-3xl text-[13px] leading-5 text-ink2">{subtitle}</p>}
        </div>
        {children && <div className="flex flex-wrap items-center gap-2">{children}</div>}
      </div>
      {tabs && <div className="mt-4 border-b border-line">{tabs}</div>}
    </div>
  );
}

/** Card: title and a short muted description on one line ("Usage  Billable events, ..."), action on the right. */
export function Card({ title, subtitle, action, children, className = "", pad = true }: {
  title?: ReactNode; subtitle?: ReactNode; action?: ReactNode; children: ReactNode; className?: string; pad?: boolean;
}) {
  return (
    <section className={`card ${className}`}>
      {(title || action) && (
        <header className="flex items-start justify-between gap-3 px-5 pt-5">
          <div className="flex min-w-0 flex-wrap items-baseline gap-x-2.5 gap-y-0.5">
            <h2 className="text-[14px] font-semibold leading-5 text-ink">{title}</h2>
            {subtitle && <p className="text-[12px] leading-4 text-muted">{subtitle}</p>}
          </div>
          {action}
        </header>
      )}
      <div className={pad ? (title || action ? "p-5 pt-4" : "p-5") : title || action ? "pt-4" : ""}>{children}</div>
    </section>
  );
}

/** Change as an arrow plus magnitude ("↑227%"), so direction never relies on color alone. */
export function Delta({ value, suffix, invert = false }: { value: number | null | undefined; suffix?: string; invert?: boolean }) {
  if (value === null || value === undefined || !Number.isFinite(value)) {
    return <span className="text-[12px] text-muted">no comparison{suffix ? ` ${suffix}` : ""}</span>;
  }
  const flat = Math.abs(value) < 0.005;
  const up = value > 0;
  const good = invert ? !up : up;
  return (
    <span className="num inline-flex items-baseline gap-1.5 text-[12px]">
      <span className={`font-medium ${flat ? "text-muted" : good ? "text-good" : "text-bad"}`} title={fmtDelta(value)}>
        <span aria-hidden>{flat ? "→" : up ? "↑" : "↓"}</span>{fmtDelta(Math.abs(value)).replace(/^\+/, "")}
      </span>
      {suffix && <span className="text-muted">{suffix}</span>}
    </span>
  );
}

/** Console metric tile ("Total Balance $19.81"): small grey label, large semibold number, change and context below. */
export function StatCard({ label, value, delta, deltaLabel, sub, hint }: {
  label: string; value: string; delta?: number | null; deltaLabel?: string; sub?: ReactNode; hint?: string;
}) {
  const empty = value === "—" || value === "0";
  return (
    <div className="card card-pad" title={hint}>
      <div className="label">{label}</div>
      <div className={`num mt-1.5 text-[26px] font-semibold leading-8 tracking-tight ${empty ? "text-muted" : "text-ink"}`}>{value}</div>
      {(delta !== undefined || sub) && (
        <div className="mt-1.5 flex flex-wrap items-baseline gap-x-2 gap-y-0.5 text-[12px] leading-4 text-muted">
          {delta !== undefined && <Delta value={delta} suffix={deltaLabel} />}
          {sub && <span>{sub}</span>}
        </div>
      )}
    </div>
  );
}

/** Sample size, always visible next to any aggregate. */
export function N({ n, min = MIN_SAMPLE }: { n: number; min?: number }) {
  const low = n < min;
  return (
    <span className={`num whitespace-nowrap text-[11px] ${low ? "text-warn" : "text-muted"}`} title={low ? `Low sample: fewer than ${min} posts. Not enough to draw conclusions.` : `${n} posts`}>
      n={n}{low ? " · low sample" : ""}
    </span>
  );
}

export function Chip({ children, href, tone }: { children: ReactNode; href?: string; tone?: "accent" | "warn" | "good" | "bad" }) {
  const toneCls = tone === "accent" ? "border-accent/40 text-ink" : tone === "warn" ? "border-warn/40 text-warn" : tone === "good" ? "border-good/40 text-good" : tone === "bad" ? "border-bad/40 text-bad" : "";
  const el = <span className={`chip ${toneCls}`}>{children}</span>;
  return href ? <Link href={href} className="hover:brightness-125">{el}</Link> : el;
}

export function Notice({ tone = "info", title, children }: { tone?: "info" | "warn" | "error"; title?: string; children: ReactNode }) {
  const cls = tone === "error" ? "border-bad/40 bg-bad/5" : tone === "warn" ? "border-warn/30 bg-warn/5" : "border-line bg-surface";
  const icon = tone === "error" ? "✖" : tone === "warn" ? "⚠" : "ℹ";
  const iconCls = tone === "error" ? "text-bad" : tone === "warn" ? "text-warn" : "text-accent";
  return (
    <div className={`flex gap-2.5 rounded-[10px] border px-4 py-3 text-[13px] leading-5 text-ink2 ${cls}`}>
      <span aria-hidden className={`mt-px ${iconCls}`}>{icon}</span>
      <div>
        {title && <div className="font-medium text-ink">{title}</div>}
        {children}
      </div>
    </div>
  );
}

export function Empty({ children }: { children: ReactNode }) {
  return <div className="hatch rounded-[10px] border border-line px-4 py-10 text-center text-[13px] text-muted">{children}</div>;
}

export function EmptyDatabase() {
  return (
    <div className="card mx-auto mt-16 max-w-xl p-8 text-center">
      <h1 className="text-lg font-semibold">No data yet</h1>
      <p className="mt-2 text-[13px] leading-5 text-muted">
        The database is empty. Run the first sync from a terminal in the project folder, then reload this page.
      </p>
      <pre className="mt-4 rounded-control border border-line bg-sunken px-3 py-2 text-left font-mono text-xs text-ink2">npm run sync</pre>
    </div>
  );
}
