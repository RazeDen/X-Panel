/**
 * All calendar logic (days, weeks, hours) runs in the account's timezone.
 * Timestamps are stored in UTC (ISO 8601) and converted here.
 */
export const TZ = process.env.ANALYTICS_TZ || "Europe/Warsaw";

const partsFmt = new Intl.DateTimeFormat("en-CA", {
  timeZone: TZ, year: "numeric", month: "2-digit", day: "2-digit",
  hour: "2-digit", minute: "2-digit", hourCycle: "h23", weekday: "short",
});
const DOW: Record<string, number> = { Mon: 1, Tue: 2, Wed: 3, Thu: 4, Fri: 5, Sat: 6, Sun: 7 };
export const DOW_NAMES = ["Mon", "Tue", "Wed", "Thu", "Fri", "Sat", "Sun"];
const MONTHS = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"];

export interface LocalParts {
  date: string; // YYYY-MM-DD in TZ
  hour: number; // 0-23 in TZ
  minute: number;
  dow: number; // 1 = Monday ... 7 = Sunday
  dowName: string;
  time: string; // HH:MM
}

export function localParts(iso: string | Date): LocalParts {
  const d = typeof iso === "string" ? new Date(iso) : iso;
  const p: Record<string, string> = {};
  for (const part of partsFmt.formatToParts(d)) p[part.type] = part.value;
  const hour = Number(p.hour) % 24;
  return {
    date: `${p.year}-${p.month}-${p.day}`,
    hour,
    minute: Number(p.minute),
    dow: DOW[p.weekday],
    dowName: p.weekday,
    time: `${String(hour).padStart(2, "0")}:${p.minute}`,
  };
}

/** Date-string arithmetic (calendar days, no timezone involved). */
function toUTC(date: string): number {
  const [y, m, d] = date.split("-").map(Number);
  return Date.UTC(y, m - 1, d);
}
function fromUTC(ms: number): string {
  return new Date(ms).toISOString().slice(0, 10);
}
export function addDays(date: string, n: number): string {
  return fromUTC(toUTC(date) + n * 86400000);
}
export function daysBetween(a: string, b: string): number {
  return Math.round((toUTC(b) - toUTC(a)) / 86400000);
}
export function dowOfDate(date: string): number {
  const js = new Date(toUTC(date)).getUTCDay(); // 0 = Sunday
  return js === 0 ? 7 : js;
}

export interface WeekInfo {
  key: string; // 2026-W40
  year: number;
  week: number;
  start: string; // Monday
  end: string; // Sunday
  label: string; // "Sep 28 - Oct 4"
}

/** ISO-8601 week (Monday start; week 1 contains the first Thursday) of a local calendar date. */
export function weekOfDate(date: string): WeekInfo {
  const dow = dowOfDate(date);
  const start = addDays(date, 1 - dow);
  const thursday = addDays(start, 3);
  const year = Number(thursday.slice(0, 4));
  const jan1 = `${year}-01-01`;
  const week = Math.floor(daysBetween(jan1, thursday) / 7) + 1;
  return weekFromStart(start, year, week);
}
function weekFromStart(start: string, year: number, week: number): WeekInfo {
  const end = addDays(start, 6);
  return { key: `${year}-W${String(week).padStart(2, "0")}`, year, week, start, end, label: `${shortDate(start)} - ${shortDate(end)}` };
}
export function weekFromKey(key: string): WeekInfo | null {
  const m = /^(\d{4})-W(\d{2})$/.exec(key);
  if (!m) return null;
  const year = Number(m[1]);
  const week = Number(m[2]);
  // Jan 4th is always in ISO week 1.
  const w1 = weekOfDate(`${year}-01-04`);
  const start = addDays(w1.start, (week - 1) * 7);
  const info = weekOfDate(start);
  return info.key === key ? info : null;
}
export function prevWeek(w: WeekInfo): WeekInfo {
  return weekOfDate(addDays(w.start, -7));
}
export function nextWeek(w: WeekInfo): WeekInfo {
  return weekOfDate(addDays(w.start, 7));
}

export function shortDate(date: string): string {
  const [, m, d] = date.split("-").map(Number);
  return `${MONTHS[m - 1]} ${d}`;
}
export function longDate(date: string): string {
  const [y, m, d] = date.split("-").map(Number);
  return `${MONTHS[m - 1]} ${d}, ${y}`;
}
export function formatDateTime(iso: string): string {
  const p = localParts(iso);
  return `${longDate(p.date)} ${p.time}`;
}
export function today(now: Date = new Date()): string {
  return localParts(now).date;
}

export const TIME_BUCKETS = [
  { key: "00-06", label: "00:00-06:00", from: 0, to: 6 },
  { key: "06-09", label: "06:00-09:00", from: 6, to: 9 },
  { key: "09-12", label: "09:00-12:00", from: 9, to: 12 },
  { key: "12-15", label: "12:00-15:00", from: 12, to: 15 },
  { key: "15-18", label: "15:00-18:00", from: 15, to: 18 },
  { key: "18-21", label: "18:00-21:00", from: 18, to: 21 },
  { key: "21-00", label: "21:00-00:00", from: 21, to: 24 },
] as const;
export function bucketOfHour(hour: number): string {
  return (TIME_BUCKETS.find((b) => hour >= b.from && hour < b.to) ?? TIME_BUCKETS[0]).label;
}
