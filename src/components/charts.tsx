"use client";
import { useRouter } from "next/navigation";
import {
  Bar, BarChart, CartesianGrid, Cell, Legend, Line, LineChart, ReferenceLine, ResponsiveContainer, Scatter, ScatterChart,
  Tooltip, XAxis, YAxis, ZAxis,
} from "recharts";
import { fmtCompact, fmtInt, fmtRate } from "@/lib/format";

export type ValueFormat = "int" | "compact" | "rate" | "score";
const FORMATTERS: Record<ValueFormat, (v: number | null | undefined) => string> = {
  int: fmtInt,
  compact: fmtCompact,
  rate: (v) => fmtRate(v),
  score: (v) => (v === null || v === undefined ? "—" : String(Math.round(v))),
};
export const SERIES_COLORS = ["var(--series-1)", "var(--series-2)", "var(--series-3)", "var(--series-4)"];

export interface ChartRow { label: string; href?: string; note?: string; [key: string]: string | number | null | undefined }
export interface SeriesDef { key: string; label: string }

const axis = { stroke: "var(--line)", tick: { fill: "var(--muted)", fontSize: 11 }, tickLine: false, axisLine: false } as const;

interface TipEntry { dataKey?: string | number; name?: string | number; value?: number | string | null; color?: string; payload?: ChartRow }
function Tip({ active, payload, label, format, series }: { active?: boolean; payload?: TipEntry[]; label?: string | number; format: ValueFormat; series: SeriesDef[] }) {
  if (!active || !payload?.length) return null;
  const row = payload[0].payload;
  return (
    <div className="rounded-[8px] border border-line bg-sunken px-3 py-2 text-xs shadow-[inset_0_1px_0_#ffffff0d,0_2px_8px_#00000080,0_16px_34px_-14px_#000000bf]">
      <div className="mb-1 font-medium text-ink">{row?.label ?? label}</div>
      {payload.map((p, i) => (
        <div key={i} className="flex items-center justify-between gap-4 text-ink2">
          <span className="flex items-center gap-1.5">
            <span className="inline-block h-2 w-2 rounded-sm" style={{ background: p.color }} />
            {series.find((s) => s.key === p.dataKey)?.label ?? p.name}
          </span>
          <span className="num font-medium text-ink">{FORMATTERS[format](typeof p.value === "number" ? p.value : null)}</span>
        </div>
      ))}
      {row?.note && <div className="mt-1 text-muted">{row.note}</div>}
      {row?.href && <div className="mt-1 text-muted">Click to open</div>}
    </div>
  );
}

/** Console legend ("● Post"): coloured dot + grey label, top-left of the plot. */
function legend(series: SeriesDef[]) {
  if (series.length < 2) return null;
  return (
    <Legend verticalAlign="top" align="left" wrapperStyle={{ paddingBottom: 10 }}
      content={() => (
        <div className="flex flex-wrap gap-4">
          {series.map((s, i) => (
            <span key={s.key} className="inline-flex items-center gap-1.5 text-[12px] text-ink2">
              <span className="h-1.5 w-1.5 rounded-full" style={{ background: SERIES_COLORS[i] }} />
              {s.label}
            </span>
          ))}
        </div>
      )} />
  );
}

export function BarsChart({ data, series, format = "compact", height = 220 }: { data: ChartRow[]; series: SeriesDef[]; format?: ValueFormat; height?: number }) {
  const router = useRouter();
  const clickable = data.some((d) => d.href);
  const open = (d: unknown) => {
    const row = (d as { payload?: ChartRow })?.payload ?? (d as ChartRow);
    if (row?.href) router.push(row.href);
  };
  if (!data.length) return <div className="flex items-center justify-center text-xs text-muted" style={{ height }}>No data in this range</div>;
  return (
    <ResponsiveContainer width="100%" height={height}>
      <BarChart data={data} margin={{ top: 4, right: 4, bottom: 0, left: 0 }} barCategoryGap="22%" barGap={2}>
        <CartesianGrid vertical={false} stroke="var(--grid)" />
        <XAxis dataKey="label" {...axis} interval="preserveStartEnd" minTickGap={16} />
        <YAxis {...axis} width={44} tickFormatter={(v: number) => FORMATTERS[format](v)} allowDecimals={format === "rate"} />
        <Tooltip cursor={{ fill: "rgba(231,233,234,0.06)" }} content={<Tip format={format} series={series} />} />
        {legend(series)}
        {series.map((s, i) => (
          <Bar key={s.key} dataKey={s.key} name={s.label} fill={SERIES_COLORS[i]} radius={[2, 2, 0, 0]} maxBarSize={40} isAnimationActive={false}
            onClick={open} cursor={clickable ? "pointer" : undefined} />
        ))}
      </BarChart>
    </ResponsiveContainer>
  );
}

export function LinesChart({ data, series, format = "compact", height = 220, reference }: {
  data: ChartRow[]; series: SeriesDef[]; format?: ValueFormat; height?: number; reference?: { value: number; label: string };
}) {
  if (!data.length) return <div className="flex items-center justify-center text-xs text-muted" style={{ height }}>No data in this range</div>;
  return (
    <ResponsiveContainer width="100%" height={height}>
      <LineChart data={data} margin={{ top: 4, right: 8, bottom: 0, left: 0 }}>
        <CartesianGrid vertical={false} stroke="var(--grid)" />
        <XAxis dataKey="label" {...axis} interval="preserveStartEnd" minTickGap={24} />
        <YAxis {...axis} width={48} tickFormatter={(v: number) => FORMATTERS[format](v)} />
        <Tooltip cursor={{ stroke: "var(--muted)", strokeDasharray: "3 3" }} content={<Tip format={format} series={series} />} />
        {legend(series)}
        {reference && <ReferenceLine y={reference.value} stroke="var(--muted)" strokeDasharray="4 4" label={{ value: reference.label, fill: "var(--muted)", fontSize: 10, position: "insideTopRight" }} />}
        {series.map((s, i) => (
          <Line key={s.key} type="linear" dataKey={s.key} name={s.label} stroke={SERIES_COLORS[i]} strokeWidth={2} isAnimationActive={false}
            dot={{ r: data.length > 40 ? 0 : 3, fill: SERIES_COLORS[i], stroke: "var(--surface)", strokeWidth: 2 }} activeDot={{ r: 5, stroke: "var(--surface)", strokeWidth: 2 }} connectNulls={false} />
        ))}
      </LineChart>
    </ResponsiveContainer>
  );
}

export interface QuadrantPoint { id: number; x: number; y: number; label: string; impressions: number | null; outlier: string | null }
/** Distribution (reach) against engagement quality. Each dot is a post; click to open it. */
export function QuadrantChart({ points, height = 340 }: { points: QuadrantPoint[]; height?: number }) {
  const router = useRouter();
  if (!points.length) return <div className="flex items-center justify-center text-xs text-muted" style={{ height }}>Not enough scored posts in this range</div>;
  return (
    <ResponsiveContainer width="100%" height={height}>
      <ScatterChart margin={{ top: 8, right: 12, bottom: 18, left: 0 }}>
        <CartesianGrid stroke="var(--grid)" />
        <XAxis type="number" dataKey="x" domain={[0, 100]} ticks={[0, 25, 50, 75, 100]} {...axis}
          label={{ value: "Distribution score (reach percentile)", position: "insideBottom", offset: -10, fill: "var(--muted)", fontSize: 11 }} />
        <YAxis type="number" dataKey="y" domain={[0, 100]} ticks={[0, 25, 50, 75, 100]} {...axis} width={56}
          label={{ value: "Engagement quality score", angle: -90, position: "insideLeft", offset: 8, style: { textAnchor: "middle" }, fill: "var(--muted)", fontSize: 11 }} />
        <ZAxis range={[70, 70]} />
        <ReferenceLine x={50} stroke="var(--line)" />
        <ReferenceLine y={50} stroke="var(--line)" />
        <Tooltip cursor={{ strokeDasharray: "3 3", stroke: "var(--muted)" }}
          content={({ active, payload }) => {
            const p = payload?.[0]?.payload as QuadrantPoint | undefined;
            if (!active || !p) return null;
            return (
              <div className="max-w-xs rounded-[8px] border border-line bg-sunken px-3 py-2 text-xs shadow-[inset_0_1px_0_#ffffff0d,0_2px_8px_#00000080,0_16px_34px_-14px_#000000bf]">
                <div className="mb-1 font-medium text-ink">{p.label}</div>
                <div className="num text-ink2">Distribution {Math.round(p.x)} &middot; Quality {Math.round(p.y)} &middot; {fmtCompact(p.impressions)} impressions</div>
                <div className="mt-1 text-muted">Click to open</div>
              </div>
            );
          }} />
        <Scatter data={points} isAnimationActive={false} cursor="pointer" onClick={(d) => {
          const p = ((d as unknown as { payload?: QuadrantPoint })?.payload ?? d) as QuadrantPoint;
          if (p?.id) router.push(`/posts/${p.id}`);
        }}>
          {points.map((p) => (
            <Cell key={p.id} fill={p.outlier === "below" ? "var(--bad)" : p.outlier ? "var(--good)" : "var(--series-1)"} stroke="var(--surface)" strokeWidth={2} />
          ))}
        </Scatter>
      </ScatterChart>
    </ResponsiveContainer>
  );
}
