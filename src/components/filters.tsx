"use client";
import { usePathname, useRouter, useSearchParams } from "next/navigation";
import { useEffect, useState, useTransition } from "react";
import { RANGES } from "@/lib/filters";

/** Reads and writes filter state in the URL, so every view is linkable. */
export function useUrlState() {
  const router = useRouter();
  const pathname = usePathname();
  const params = useSearchParams();
  const [pending, start] = useTransition();
  const set = (changes: Record<string, string | null>) => {
    // Always start from the live URL: a debounced update must not resurrect filters cleared in the meantime.
    const sp = new URLSearchParams(typeof window !== "undefined" ? window.location.search : params.toString());
    for (const [k, v] of Object.entries(changes)) {
      if (v === null || v === "") sp.delete(k);
      else sp.set(k, v);
    }
    const qs = sp.toString();
    start(() => router.replace(qs ? `${pathname}?${qs}` : pathname, { scroll: false }));
  };
  return { params, set, pending };
}

export interface FilterOptions { topic: string[]; format: string[]; ctype: string[]; hook: string[] }
type Field = "range" | "topic" | "format" | "ctype" | "hook" | "min" | "q" | "kind";

export function FilterBar({ show, options, defaultRange = "30d", windowLabel, count }: {
  show: Field[]; options?: FilterOptions; defaultRange?: string; windowLabel?: string; count?: string;
}) {
  const { params, set, pending } = useUrlState();
  const has = (f: Field) => show.includes(f);
  const custom = params.get("week") || params.get("from") || params.get("to");
  const range = params.get("range") ?? defaultRange;
  const [q, setQ] = useState(params.get("q") ?? "");
  const [min, setMin] = useState(params.get("min") ?? "");
  // Debounce free-text inputs so typing does not reload on every keystroke.
  useEffect(() => {
    const t = setTimeout(() => {
      if ((params.get("q") ?? "") !== q) set({ q: q || null });
    }, 300);
    return () => clearTimeout(t);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [q]);
  useEffect(() => {
    const t = setTimeout(() => {
      if ((params.get("min") ?? "") !== min) set({ min: min || null });
    }, 400);
    return () => clearTimeout(t);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [min]);

  const select = (key: "topic" | "format" | "ctype" | "hook", label: string, values: string[]) => {
    const current = params.get(key) ?? "";
    const list = current && !values.includes(current) ? [current, ...values] : values;
    return (
      <select aria-label={label} className={`input max-w-[160px] ${current ? "border-accent/60" : ""}`} value={current} onChange={(e) => set({ [key]: e.target.value || null })}>
        <option value="">{label}: all</option>
        {list.map((v) => <option key={v} value={v}>{v}</option>)}
      </select>
    );
  };
  const active = ["topic", "format", "ctype", "hook", "min", "q", "week", "from", "to", "dow", "slot"].filter((k) => params.get(k));

  return (
    <div className={`mb-4 flex flex-wrap items-center gap-2 ${pending ? "opacity-70" : ""}`}>
      {has("range") && (
        <div className="seg" role="group" aria-label="Date range">
          {RANGES.map((r) => (
            <button key={r.key} type="button" aria-pressed={!custom && range === r.key} onClick={() => set({ range: r.key, week: null, from: null, to: null })}
              className={`seg-item ${!custom && range === r.key ? "seg-active" : ""}`}>
              {r.label}
            </button>
          ))}
        </div>
      )}
      {custom && windowLabel && (
        <span className="chip border-accent/50 text-ink">
          {windowLabel}
          <button type="button" aria-label="Clear date filter" className="ml-0.5 text-muted hover:text-ink" onClick={() => set({ week: null, from: null, to: null })}>&times;</button>
        </span>
      )}
      {(["dow", "slot"] as const).map((k) => params.get(k) && (
        <span key={k} className="chip border-accent/50 text-ink">
          {k === "dow" ? "Day" : "Slot"}: {params.get(k)}
          <button type="button" aria-label={`Clear ${k} filter`} className="ml-0.5 text-muted hover:text-ink" onClick={() => set({ [k]: null })}>&times;</button>
        </span>
      ))}
      {has("kind") && (
        <select aria-label="Post kind" className="input" value={params.get("kind") ?? "original"} onChange={(e) => set({ kind: e.target.value === "original" ? null : e.target.value })}>
          <option value="original">Original posts</option>
          <option value="reply">Replies</option>
          <option value="repost">Reposts</option>
          <option value="article">Articles</option>
          <option value="all">Everything</option>
        </select>
      )}
      {options && has("topic") && select("topic", "Topic", options.topic)}
      {options && has("format") && select("format", "Format", options.format)}
      {options && has("ctype") && select("ctype", "Type", options.ctype)}
      {options && has("hook") && select("hook", "Hook", options.hook)}
      {has("min") && <input className="input w-32" inputMode="numeric" placeholder="Min impressions" aria-label="Minimum impressions" value={min} onChange={(e) => setMin(e.target.value.replace(/[^\d]/g, ""))} />}
      {has("q") && <input className="input w-48" placeholder="Search text" aria-label="Search post text" value={q} onChange={(e) => setQ(e.target.value)} />}
      {active.length > 0 && (
        <button type="button" className="text-xs text-muted hover:text-ink" onClick={() => { setQ(""); setMin(""); set({ topic: null, format: null, ctype: null, hook: null, min: null, q: null, week: null, from: null, to: null, dow: null, slot: null }); }}>
          Clear filters
        </button>
      )}
      {count && <span className="ml-auto text-xs text-muted">{count}</span>}
    </div>
  );
}

/**
 * Choice bound to a URL parameter. "pills" renders the console segmented control (small toggles),
 * "underline" a tab bar with a white indicator (switching between sections, inside PageHeader tabs).
 */
export function UrlTabs({ param, options, fallback, variant = "pills" }: { param: string; options: { key: string; label: string }[]; fallback: string; variant?: "pills" | "underline" }) {
  const { params, set } = useUrlState();
  const current = params.get(param) ?? fallback;
  const pick = (key: string) => set({ [param]: key === fallback ? null : key });
  if (variant === "underline") {
    return (
      <div className="flex overflow-x-auto" role="tablist">
        {options.map((o) => (
          <button key={o.key} type="button" role="tab" aria-selected={current === o.key} onClick={() => pick(o.key)}
            className="whitespace-nowrap px-3 text-[13px] transition-colors first:pl-0">
            <span className={`relative inline-block py-2.5 ${current === o.key ? "font-medium text-ink" : "text-ink2 hover:text-ink"}`}>
              {o.label}
              {current === o.key && <span className="absolute inset-x-0 -bottom-px h-[2px] rounded-full bg-ink" />}
            </span>
          </button>
        ))}
      </div>
    );
  }
  return (
    <div className="seg" role="group">
      {options.map((o) => (
        <button key={o.key} type="button" aria-pressed={current === o.key} onClick={() => pick(o.key)} className={`seg-item ${current === o.key ? "seg-active" : ""}`}>
          {o.label}
        </button>
      ))}
    </div>
  );
}
