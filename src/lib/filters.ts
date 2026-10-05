import type { Post } from "./analytics/types";
import { addDays, today, weekFromKey } from "./time";

/** Filter state lives in the URL so any view can be bookmarked or shared. */
export interface Filters {
  range: "7d" | "30d" | "90d" | "all";
  week: string | null; // 2026-W40 - takes precedence over range
  from: string | null; // YYYY-MM-DD (local)
  to: string | null;
  topic: string | null;
  format: string | null;
  ctype: string | null;
  hook: string | null;
  minImp: number | null;
  q: string | null;
  kind: "original" | "all" | "reply" | "repost";
  dow: string | null; // Mon..Sun
  slot: string | null; // time bucket label, e.g. 18:00-21:00
}
export const RANGES: { key: Filters["range"]; label: string; days: number | null }[] = [
  { key: "7d", label: "7 days", days: 7 },
  { key: "30d", label: "30 days", days: 30 },
  { key: "90d", label: "90 days", days: 90 },
  { key: "all", label: "All time", days: null },
];

type Params = Record<string, string | string[] | undefined> | URLSearchParams;
const get = (p: Params, k: string): string | null => {
  const v = p instanceof URLSearchParams ? p.get(k) : p[k];
  const s = Array.isArray(v) ? v[0] : v;
  return s && s.trim() ? s.trim() : null;
};

export function parseFilters(params: Params, defaults: Partial<Filters> = {}): Filters {
  const range = get(params, "range");
  const kind = get(params, "kind");
  const min = Number(get(params, "min"));
  const date = (s: string | null) => (s && /^\d{4}-\d{2}-\d{2}$/.test(s) ? s : null);
  const week = get(params, "week");
  return {
    range: (RANGES.some((r) => r.key === range) ? range : defaults.range ?? "30d") as Filters["range"],
    week: week && weekFromKey(week) ? week : null,
    from: date(get(params, "from")),
    to: date(get(params, "to")),
    topic: get(params, "topic"),
    format: get(params, "format"),
    ctype: get(params, "ctype"),
    hook: get(params, "hook"),
    minImp: Number.isFinite(min) && min > 0 ? min : null,
    q: get(params, "q"),
    kind: (["original", "all", "reply", "repost"].includes(kind ?? "") ? kind : defaults.kind ?? "original") as Filters["kind"],
    dow: get(params, "dow"),
    slot: get(params, "slot"),
  };
}

/** Local-date window [start, end] implied by the filters; null bounds are open. */
export function dateWindow(f: Filters, now: Date = new Date()): { start: string | null; end: string | null; label: string; days: number | null } {
  if (f.week) {
    const w = weekFromKey(f.week)!;
    return { start: w.start, end: w.end, label: `Week ${w.week} (${w.label})`, days: 7 };
  }
  if (f.from || f.to) return { start: f.from, end: f.to, label: `${f.from ?? "start"} to ${f.to ?? "today"}`, days: null };
  const r = RANGES.find((x) => x.key === f.range)!;
  if (r.days === null) return { start: null, end: null, label: "All time", days: null };
  const end = today(now);
  return { start: addDays(end, -(r.days - 1)), end, label: `Last ${r.label}`, days: r.days };
}

export function inWindow(p: Post, start: string | null, end: string | null): boolean {
  return (!start || p.localDate >= start) && (!end || p.localDate <= end);
}

export function applyFilters(posts: Post[], f: Filters, now: Date = new Date()): Post[] {
  const { start, end } = dateWindow(f, now);
  const q = f.q?.toLowerCase();
  return posts.filter((p) => {
    if (f.kind === "original" && !p.isOriginal) return false;
    if (f.kind === "reply" && p.kind !== "reply") return false;
    if (f.kind === "repost" && p.kind !== "repost") return false;
    if (!inWindow(p, start, end)) return false;
    if (f.topic && (p.topic ?? "Untagged") !== f.topic) return false;
    if (f.format && (p.format ?? "Untagged") !== f.format) return false;
    if (f.ctype && (p.content_type ?? "Untagged") !== f.ctype) return false;
    if (f.hook && (p.hook_type ?? "Untagged") !== f.hook) return false;
    if (f.minImp !== null && (p.impressions === null || p.impressions < f.minImp)) return false;
    if (f.dow && p.dowName !== f.dow) return false;
    if (f.slot && p.bucket !== f.slot) return false;
    if (q && !p.text.toLowerCase().includes(q)) return false;
    return true;
  });
}

/** The window of equal length immediately before the current one (for "vs previous period"). */
export function previousWindow(f: Filters, now: Date = new Date()): { start: string; end: string } | null {
  const w = dateWindow(f, now);
  if (!w.start || !w.end || !w.days) return null;
  return { start: addDays(w.start, -w.days), end: addDays(w.start, -1) };
}

export function toQuery(params: Record<string, string | number | null | undefined>): string {
  const sp = new URLSearchParams();
  for (const [k, v] of Object.entries(params)) if (v !== null && v !== undefined && v !== "") sp.set(k, String(v));
  const s = sp.toString();
  return s ? `?${s}` : "";
}
