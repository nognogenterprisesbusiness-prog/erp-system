"use client";

import { useEffect, useRef, useState } from "react";
import { SelectPicker } from "@/components/ui/select-picker";
import { monthBands, niceTicks, stackSegments } from "@/lib/charts/geometry";

export type TrendSeries = { id: string; label: string; values: number[]; unit: string };
const colors = ["var(--chart-cyan, #0891b2)", "var(--chart-amber, #d97706)", "var(--chart-violet, #8b5cf6)", "var(--chart-emerald, #059669)", "var(--chart-slate, #64748b)"];
const compact = new Intl.NumberFormat("en-PH", { notation: "compact", maximumFractionDigits: 1 });
const monthLabel = (month: string) => new Intl.DateTimeFormat("en-PH", { month: "short", year: "2-digit", timeZone: "Asia/Manila" }).format(new Date(`${month}T12:00:00Z`));
const height = 260, left = 48, top = 16, bottom = 232;

/** Stacked monthly bars: one bar per month, one colour per category. */
export function TrendChart({ months, series, currency = false }: { months: string[]; series: TrendSeries[]; currency?: boolean }) {
  const container = useRef<HTMLDivElement>(null);
  const [width, setWidth] = useState(640);
  const units = [...new Set(series.map((item) => item.unit))];
  const [unit, setUnit] = useState(units[0] ?? "");
  const [hovered, setHovered] = useState<number | null>(null);
  const [pinned, setPinned] = useState<number | null>(null);
  const [highlighted, setHighlighted] = useState<string | null>(null);
  const selectedUnit = units.includes(unit) ? unit : units[0] ?? "";
  const visible = series.filter((item) => currency || item.unit === selectedUnit);
  const totals = months.map((_, index) => visible.reduce((sum, item) => sum + Math.max(0, item.values[index] ?? 0), 0));
  const empty = !visible.length || !months.length || totals.every((total) => total === 0);
  const active = empty ? null : pinned ?? hovered;
  const activeSeries = visible.some((item) => item.id === highlighted) ? highlighted : null;
  const ticks = niceTicks(Math.max(0, ...totals));
  const axisMaximum = ticks.at(-1) ?? 1;
  const right = Math.max(left + 1, width - 8);
  const bands = monthBands(months.length, left, right);
  const y = (value: number) => bottom - value / axisMaximum * (bottom - top);
  const format = (value: number) => currency ? new Intl.NumberFormat("en-PH", { style: "currency", currency: "PHP", maximumFractionDigits: 2 }).format(value) : `${value.toLocaleString("en-PH", { maximumFractionDigits: 4 })} ${selectedUnit}`;
  const summaryIndex = active ?? Math.max(0, months.length - 1);
  const tooltipWidth = Math.min(240, width - 16);
  const tooltipLeft = active === null ? 0 : Math.max(8, Math.min(width - tooltipWidth - 8, bands.center(active) > width / 2 ? bands.center(active) - bands.width / 2 - tooltipWidth - 10 : bands.center(active) + bands.width / 2 + 10));
  const colorOf = (id: string) => colors[visible.findIndex((item) => item.id === id) % colors.length];

  useEffect(() => {
    const element = container.current;
    if (!element) return;
    const observer = new ResizeObserver(() => setWidth(Math.max(200, element.clientWidth)));
    observer.observe(element);
    return () => observer.disconnect();
  }, []);

  return <div className="erp-trend-chart mt-5 min-w-0">
    <div className="mb-4 flex flex-wrap items-end justify-between gap-3">
      <div><p className="text-[11px] font-medium uppercase tracking-[0.12em] text-slate-500">{empty ? "No posted activity" : `${monthLabel(months[summaryIndex])} · ${currency ? "Monthly total" : "Recorded use"}`}</p><p className="mt-1.5 text-3xl font-semibold tracking-[-0.045em] tabular-nums text-slate-900">{empty ? "—" : format(totals[summaryIndex])}</p></div>
      {units.length > 1 && !currency && <div className="w-28"><SelectPicker label="Chart unit" value={selectedUnit} onValueChange={(value) => { setUnit(value); setHovered(null); setPinned(null); setHighlighted(null); }} options={units.map((value) => ({ value, label: value }))} /></div>}
    </div>
    <div className="mb-4 flex flex-wrap gap-2" aria-label="Chart categories">{visible.map((item) => <button key={item.id} type="button" aria-pressed={activeSeries === item.id} onClick={() => setHighlighted(activeSeries === item.id ? null : item.id)} className={`flex min-h-8 max-w-full items-center gap-2 rounded-full border border-slate-200 px-3 py-1.5 text-left text-xs font-medium text-slate-600 transition-opacity focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-cyan-600 motion-reduce:transition-none ${activeSeries && activeSeries !== item.id ? "opacity-40" : ""}`}><span className="size-2 shrink-0 rounded-full" style={{ backgroundColor: colorOf(item.id) }} /><span className="break-words">{item.label}</span></button>)}</div>
    <div ref={container} className="relative min-w-0" onKeyDown={(event) => { if (event.key === "Escape") { setPinned(null); setHovered(null); } }}>
      <svg viewBox={`0 0 ${width} ${height}`} width="100%" height={height} className="block touch-pan-y" role="img" aria-label={empty ? "No recorded activity" : currency ? "Monthly posted costs by category. Use the month buttons for exact values." : `Monthly material use in ${selectedUnit}. Use the month buttons for exact values.`} onPointerLeave={() => setHovered(null)}>
        {ticks.map((value) => <g key={value}><line x1={left} x2={right} y1={y(value)} y2={y(value)} stroke="var(--erp-dark-border, #e2e8f0)" strokeOpacity="0.8" strokeDasharray={value === 0 ? undefined : "3 6"} /><text x={left - 8} y={y(value) + 4} textAnchor="end" fill="var(--erp-dark-muted, #94a3b8)" fontSize="11">{compact.format(value)}</text></g>)}
        {empty && <text x={(left + right) / 2} y={(top + bottom) / 2} textAnchor="middle" fill="var(--erp-dark-muted, #64748b)" fontSize="13">No recorded activity</text>}
        {!empty && months.map((month, index) => {
          const segments = stackSegments(visible.map((item) => item.values[index] ?? 0));
          const topIndex = segments.findLastIndex((segment) => segment.value > 0);
          const x = bands.center(index) - bands.width / 2;
          return <g key={month} onPointerEnter={() => setHovered(index)} onClick={() => setPinned(pinned === index ? null : index)} className="cursor-pointer">
            <rect x={bands.center(index) - bands.band / 2} y={top} width={bands.band} height={bottom - top} fill={active === index ? "var(--erp-dark-border, #e2e8f0)" : "transparent"} fillOpacity="0.45" />
            {segments.map((segment, seriesIndex) => {
              if (segment.value <= 0) return null;
              const item = visible[seriesIndex];
              const height = Math.max(1.5, y(segment.from) - y(segment.to));
              const radius = seriesIndex === topIndex ? Math.min(5, bands.width / 3) : 0;
              const yTop = y(segment.to);
              return <path key={item.id} opacity={activeSeries && activeSeries !== item.id ? 0.2 : 1} className="transition-opacity motion-reduce:transition-none" fill={colorOf(item.id)}
                d={`M${x},${yTop + height} V${yTop + radius} Q${x},${yTop} ${x + radius},${yTop} H${x + bands.width - radius} Q${x + bands.width},${yTop} ${x + bands.width},${yTop + radius} V${yTop + height} Z`} />;
            })}
          </g>;
        })}
      </svg>
      {active !== null && <div role="status" className="pointer-events-auto absolute top-2 z-10 max-h-56 overflow-y-auto rounded-xl bg-[#07152d] p-3 text-white shadow-xl ring-1 ring-white/10" style={{ width: tooltipWidth, left: tooltipLeft }}>
        <div className="mb-2 flex items-center justify-between gap-3"><span className="text-[11px] font-medium text-white/60">{monthLabel(months[active])}</span>{pinned !== null && <button type="button" aria-label="Close chart values" onClick={() => setPinned(null)} className="grid size-6 place-items-center rounded-full text-white/70 hover:bg-white/10 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-white">×</button>}</div>
        <dl className="space-y-1.5">{visible.map((item) => <div key={item.id} className="flex items-start justify-between gap-3 text-xs"><dt className="flex min-w-0 items-start gap-2 text-white/80"><span className="mt-1 size-1.5 shrink-0 rounded-full" style={{ background: colorOf(item.id) }} /><span className="break-words">{item.label}</span></dt><dd className="shrink-0 font-semibold tabular-nums">{format(item.values[active] ?? 0)}</dd></div>)}</dl>
        <div className="mt-2 flex justify-between border-t border-white/10 pt-2 text-xs font-semibold"><span>Total</span><span className="tabular-nums">{format(totals[active])}</span></div>
      </div>}
      {!empty && <div className="relative h-9" aria-label="Select chart month">{months.map((month, index) => <button key={month} type="button" aria-pressed={pinned === index} aria-label={`Show ${monthLabel(month)} values`} onClick={() => setPinned(pinned === index ? null : index)} className={`absolute top-0 min-h-8 -translate-x-1/2 whitespace-nowrap rounded-md px-1 text-[11px] font-medium focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-cyan-600 ${active === index ? "text-cyan-800" : "text-slate-500 hover:text-slate-900"}`} style={{ left: `${bands.center(index) / width * 100}%` }}>{monthLabel(month)}</button>)}</div>}
    </div>
    <p className="mt-2 text-[11px] text-slate-500">Tap a bar or month to see its values.</p>
  </div>;
}
