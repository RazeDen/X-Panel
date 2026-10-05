import { addDays, daysBetween, longDate, shortDate, today, weekOfDate } from "../time";
import type { Post } from "./types";

/**
 * Posting activity: original posts per local calendar day (Europe/Warsaw), laid out as a
 * Monday-first week grid. Counts only - no reach or engagement involved.
 */
export interface ActivityPeriod {
  key: string; // "12m" or a year, e.g. "2026"
  label: string;
  start: string; // YYYY-MM-DD, inclusive
  end: string; // inclusive, never after today
}

export interface ActivityCell {
  date: string;
  count: number;
  level: 0 | 1 | 2 | 3 | 4;
  /** False for padding days before the period start or after its end / today. */
  inPeriod: boolean;
}

export interface Streak {
  days: number;
  start: string | null;
  end: string | null;
}

export interface Activity {
  period: ActivityPeriod;
  weeks: ActivityCell[][]; // columns of 7 cells, Monday first
  months: { col: number; label: string }[];
  /** Upper bound (inclusive) of each colour level 1-4, for the legend. */
  levelMax: [number, number, number, number];
  posts: number;
  activeDays: number;
  periodDays: number;
  longest: Streak;
  busiest: { date: string; count: number } | null;
  peakHour: { hour: number; n: number } | null;
  topFormat: { format: string; n: number } | null;
}

export function activityPeriods(posts: Post[], now: Date = new Date()): ActivityPeriod[] {
  const end = today(now);
  const out: ActivityPeriod[] = [{ key: "12m", label: "Last 12 months", start: addDays(end, -364), end }];
  const years = [...new Set(posts.map((p) => p.localDate.slice(0, 4)))].sort().reverse();
  for (const y of years) out.push({ key: y, label: y, start: `${y}-01-01`, end: `${y}-12-31` < end ? `${y}-12-31` : end });
  return out;
}

function countByDay(posts: Post[]): Map<string, number> {
  const m = new Map<string, number>();
  for (const p of posts) m.set(p.localDate, (m.get(p.localDate) ?? 0) + 1);
  return m;
}

function mode<T>(values: T[]): { value: T; n: number } | null {
  const m = new Map<T, number>();
  for (const v of values) m.set(v, (m.get(v) ?? 0) + 1);
  let best: { value: T; n: number } | null = null;
  for (const [value, n] of m) if (!best || n > best.n) best = { value, n };
  return best;
}

/** Longest run of consecutive days with at least one post inside [start, end]. */
function longestStreak(counts: Map<string, number>, start: string, end: string): Streak {
  let best: Streak = { days: 0, start: null, end: null };
  let runStart: string | null = null;
  let run = 0;
  for (let d = start; d <= end; d = addDays(d, 1)) {
    if ((counts.get(d) ?? 0) > 0) {
      if (!run) runStart = d;
      run++;
      if (run > best.days) best = { days: run, start: runStart, end: d };
    } else run = 0;
  }
  return best;
}

/**
 * Days in a row with at least one post, ending today - or yesterday when nothing has been
 * posted yet today (the streak is not broken until the day is over).
 */
export function currentStreak(posts: Post[], now: Date = new Date()): Streak & { postedToday: boolean } {
  const counts = countByDay(posts);
  const t = today(now);
  const postedToday = (counts.get(t) ?? 0) > 0;
  let d = postedToday ? t : addDays(t, -1);
  const end = d;
  let days = 0;
  while ((counts.get(d) ?? 0) > 0) {
    days++;
    d = addDays(d, -1);
  }
  return { days, start: days ? addDays(end, -(days - 1)) : null, end: days ? end : null, postedToday };
}

export function buildActivity(posts: Post[], period: ActivityPeriod): Activity {
  const inRange = posts.filter((p) => p.localDate >= period.start && p.localDate <= period.end);
  const counts = countByDay(inRange);
  const max = Math.max(0, ...counts.values());
  // Small counts map one-to-one onto the four colours; larger ones are split into four equal bands.
  const levelMax: Activity["levelMax"] = max <= 4 ? [1, 2, 3, 4] : [1, 2, 3, 4].map((i) => Math.ceil((max * i) / 4)) as Activity["levelMax"];
  const level = (n: number): ActivityCell["level"] => (n <= 0 ? 0 : (levelMax.findIndex((m) => n <= m) + 1) as ActivityCell["level"]);

  const gridStart = weekOfDate(period.start).start;
  const gridEnd = weekOfDate(period.end).end;
  const weeks: ActivityCell[][] = [];
  const months: Activity["months"] = [];
  for (let w = gridStart; w <= gridEnd; w = addDays(w, 7)) {
    const col = weeks.length;
    const cells: ActivityCell[] = [];
    for (let i = 0; i < 7; i++) {
      const date = addDays(w, i);
      const count = counts.get(date) ?? 0;
      const inPeriod = date >= period.start && date <= period.end;
      cells.push({ date, count, level: inPeriod ? level(count) : 0, inPeriod });
      if (inPeriod && (date.endsWith("-01") || date === period.start)) months.push({ col, label: shortDate(date).slice(0, 3) });
    }
    weeks.push(cells);
  }
  // Drop a label that would collide with the next one (a period starting late in a month).
  const spaced = months.filter((m, i) => !months[i + 1] || months[i + 1].col - m.col >= 3);

  const busiestEntry = [...counts.entries()].sort((a, b) => b[1] - a[1] || a[0].localeCompare(b[0]))[0];
  const peak = mode(inRange.map((p) => p.hour));
  const fmt = mode(inRange.map((p) => p.format ?? "Untagged"));
  return {
    period,
    weeks,
    months: spaced,
    levelMax,
    posts: inRange.length,
    activeDays: counts.size,
    periodDays: daysBetween(period.start, period.end) + 1,
    longest: longestStreak(counts, period.start, period.end),
    busiest: busiestEntry ? { date: busiestEntry[0], count: busiestEntry[1] } : null,
    peakHour: peak ? { hour: peak.value, n: peak.n } : null,
    topFormat: fmt ? { format: fmt.value, n: fmt.n } : null,
  };
}

export function streakRange(s: Streak): string {
  if (!s.start || !s.end) return "no posts";
  return s.start === s.end ? longDate(s.start) : `${shortDate(s.start)} - ${longDate(s.end)}`;
}
