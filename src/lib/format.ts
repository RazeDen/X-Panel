/** Display helpers shared by the dashboard and the CLI. Missing values render as an em dash, never as 0. */
export const DASH = "—";

export function fmtInt(v: number | null | undefined): string {
  if (v === null || v === undefined || !Number.isFinite(v)) return DASH;
  return Math.round(v).toLocaleString("en-US");
}
/** Compact number: 1,234 -> 1.2K, 261,488 -> 261K. */
export function fmtCompact(v: number | null | undefined): string {
  if (v === null || v === undefined || !Number.isFinite(v)) return DASH;
  const a = Math.abs(v);
  if (a >= 1e6) return (v / 1e6).toFixed(a >= 1e7 ? 1 : 2).replace(/\.?0+$/, "") + "M";
  if (a >= 1e5) return Math.round(v / 1e3) + "K";
  if (a >= 1e3) return (v / 1e3).toFixed(1).replace(/\.0$/, "") + "K";
  return String(Math.round(v));
}
/** Rate as a percentage: 0.01234 -> 1.23%. */
export function fmtRate(v: number | null | undefined, digits = 2): string {
  if (v === null || v === undefined || !Number.isFinite(v)) return DASH;
  return (v * 100).toFixed(digits) + "%";
}
/** Signed change: 0.32 -> +32%. */
export function fmtDelta(v: number | null | undefined): string {
  if (v === null || v === undefined || !Number.isFinite(v)) return DASH;
  const pct = v * 100;
  const s = Math.abs(pct) >= 1000 ? Math.round(pct).toLocaleString("en-US") : Math.abs(pct) >= 10 ? pct.toFixed(0) : pct.toFixed(1);
  return (pct > 0 ? "+" : "") + s + "%";
}
export function fmtMultiple(v: number | null | undefined): string {
  if (v === null || v === undefined || !Number.isFinite(v)) return DASH;
  return (v >= 10 ? v.toFixed(0) : v.toFixed(1)) + "×";
}
export function fmtPercentile(v: number | null | undefined): string {
  if (v === null || v === undefined || !Number.isFinite(v)) return DASH;
  const n = Math.round(v);
  const s = n % 100 >= 11 && n % 100 <= 13 ? "th" : n % 10 === 1 ? "st" : n % 10 === 2 ? "nd" : n % 10 === 3 ? "rd" : "th";
  return `${n}${s}`;
}
export function preview(text: string, max = 110): string {
  const t = text.replace(/https?:\/\/\S+/g, "").replace(/\s+/g, " ").trim();
  return t.length > max ? t.slice(0, max - 1).trimEnd() + "…" : t || "(no text)";
}
export function fmtDuration(ms: number | null | undefined): string {
  if (ms === null || ms === undefined) return DASH;
  const s = Math.round(ms / 1000);
  return s >= 60 ? `${Math.floor(s / 60)}m ${s % 60}s` : `${s}s`;
}
