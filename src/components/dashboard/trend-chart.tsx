"use client";

import { useEffect, useId, useRef, useState } from "react";
import { SelectPicker } from "@/components/ui/select-picker";
import { chartScale, monthPosition, monotonePath } from "@/lib/charts/geometry";

export type TrendSeries = { id: string; label: string; values: number[]; unit: string };
const colors = ["var(--chart-cyan, #0891b2)", "var(--chart-amber, #d97706)", "var(--chart-emerald, #059669)", "var(--chart-violet, #8b5cf6)", "var(--chart-slate, #64748b)"];
const compact = new Intl.NumberFormat("en-PH", { notation: "compact", maximumFractionDigits: 1 });
const monthLabel = (month: string) => new Intl.DateTimeFormat("en-PH", { month: "short", year: "2-digit", timeZone: "Asia/Manila" }).format(new Date(`${month}T12:00:00Z`));
const height = 290, left = 48, top = 24, bottom = 254;

export function TrendChart({ months, series, currency = false, area = false }: { months: string[]; series: TrendSeries[]; currency?: boolean; area?: boolean }) {
  const gradientId = useId().replaceAll(":", "");
  const container = useRef<HTMLDivElement>(null);
  const [width, setWidth] = useState(640);
  const units = [...new Set(series.map((item) => item.unit))];
  const [unit, setUnit] = useState(units[0] ?? "");
  const [selection, setSelection] = useState<string | null>(null);
  const [pinned, setPinned] = useState<string | null>(null);
  const [highlighted, setHighlighted] = useState<string | null>(null);
  const selectedUnit = units.includes(unit) ? unit : units[0] ?? "";
  const visible = series.filter((item) => currency || item.unit === selectedUnit);
  const empty = !visible.length || !months.length;
  const selectedIndex = months.indexOf(pinned ?? selection ?? "");
  const activeMonth = !empty && selectedIndex >= 0 ? selectedIndex : null;
  const activeSeries = visible.some((item) => item.id === highlighted) ? highlighted : null;
  const scale = chartScale(visible.flatMap((item) => item.values));
  const right = Math.max(left + 1, width - 16);
  const x = (index: number) => monthPosition(index, months.length, left, right);
  const y = (value: number) => bottom - (value - scale.minimum) / (scale.maximum - scale.minimum) * (bottom - top);
  const format = (value: number) => currency ? new Intl.NumberFormat("en-PH", { style: "currency", currency: "PHP", maximumFractionDigits: 2 }).format(value) : `${value.toLocaleString("en-PH", { maximumFractionDigits: 4 })} ${selectedUnit}`;
  const lines = visible.map((item, index) => ({ ...item, color: colors[index % colors.length], points: months.map((_, i) => [x(i), y(item.values[i] ?? 0)] as const) }));
  const summaryIndex = activeMonth ?? Math.max(0, months.length - 1);
  const summaryValue = visible.reduce((total, item) => total + (item.values[summaryIndex] ?? 0), 0);
  const tooltipWidth = Math.min(248, width - 16);
  const tooltipLeft = activeMonth === null ? 0 : Math.max(8, Math.min(width - tooltipWidth - 8, x(activeMonth) > width / 2 ? x(activeMonth) - tooltipWidth - 18 : x(activeMonth) + 18));

  useEffect(() => {
    const element = container.current;
    if (!element) return;
    const observer = new ResizeObserver(() => setWidth(Math.max(180, element.clientWidth)));
    observer.observe(element);
    return () => observer.disconnect();
  }, []);

  function selectFromPointer(event: React.PointerEvent<SVGSVGElement>) {
    if (pinned || empty || event.pointerType === "touch") return;
    const bounds = event.currentTarget.getBoundingClientRect();
    const position = (event.clientX - bounds.left) * width / bounds.width;
    const index = Math.round(Math.max(0, Math.min(1, (position - left) / (right - left))) * (months.length - 1));
    setSelection(months[index]);
  }

  return <div className="erp-trend-chart mt-5 min-w-0">
    <div className="mb-5 flex flex-wrap items-end justify-between gap-3">
      <div><p className="text-[11px] font-medium uppercase tracking-[0.12em] text-slate-500">{empty ? "No posted activity" : `${monthLabel(months[summaryIndex])} · ${currency ? "Monthly total" : "Recorded use"}`}</p><p className="mt-1.5 text-3xl font-semibold tracking-[-0.045em] tabular-nums text-slate-900">{empty ? "—" : format(summaryValue)}</p></div>
      {units.length > 1 && !currency && <div className="w-28"><SelectPicker label="Chart unit" value={selectedUnit} onValueChange={(value) => { setUnit(value); setSelection(null); setPinned(null); setHighlighted(null); }} options={units.map((value) => ({ value, label: value }))} /></div>}
    </div>
    <div className="mb-4 flex flex-wrap gap-2" aria-label="Chart series">{visible.map((item, index) => <button key={item.id} type="button" aria-pressed={activeSeries === item.id} aria-label={`Highlight ${item.label}`} onPointerEnter={() => setHighlighted(item.id)} onPointerLeave={() => setHighlighted(null)} onFocus={() => setHighlighted(item.id)} onBlur={() => setHighlighted(null)} onClick={() => setHighlighted(activeSeries === item.id ? null : item.id)} className={`flex min-h-8 max-w-full items-center gap-2 rounded-full border border-slate-200 px-3 py-1.5 text-left text-xs font-medium text-slate-600 transition-opacity focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-cyan-600 motion-reduce:transition-none ${activeSeries && activeSeries !== item.id ? "opacity-40" : ""}`}><span className="size-2 shrink-0 rounded-full" style={{ backgroundColor: colors[index % colors.length] }} /><span className="break-words">{item.label}</span></button>)}</div>
    <div ref={container} className="relative min-w-0" onKeyDown={(event) => { if (event.key === "Escape") { setPinned(null); setSelection(null); } }}>
      <svg viewBox={`0 0 ${width} ${height}`} width="100%" height={height} className="block touch-pan-y overflow-visible" role="img" aria-label={empty ? "No recorded usage" : currency ? "Monthly posted expenses by category. Use the month buttons for exact values." : `Monthly material consumption in ${selectedUnit}. Use the month buttons for exact values.`} onPointerMove={selectFromPointer} onPointerLeave={() => { if (!pinned) setSelection(null); }} onClick={(event) => {
        if (empty) return;
        const bounds = event.currentTarget.getBoundingClientRect();
        const position = (event.clientX - bounds.left) * width / bounds.width;
        const index = Math.round(Math.max(0, Math.min(1, (position - left) / (right - left))) * (months.length - 1));
        setPinned(pinned === months[index] ? null : months[index]);
      }}>
        <defs>{lines.map((item, index) => <linearGradient key={item.id} id={`${gradientId}-${index}`} x1="0" y1="0" x2="0" y2="1"><stop offset="0%" stopColor={item.color} stopOpacity={area ? "0.32" : "0.12"} /><stop offset="75%" stopColor={item.color} stopOpacity="0.04" /><stop offset="100%" stopColor={item.color} stopOpacity="0" /></linearGradient>)}</defs>
        {Array.from({ length: 5 }, (_, tick) => {
          const value = scale.minimum + (scale.maximum - scale.minimum) * tick / 4;
          return <g key={tick}><line x1={left} x2={right} y1={y(value)} y2={y(value)} stroke="var(--erp-dark-border, #e2e8f0)" strokeOpacity="0.7" strokeDasharray={value === 0 ? undefined : "3 6"} /><text x={left - 10} y={y(value) + 4} textAnchor="end" fill="var(--erp-dark-muted, #94a3b8)" fontSize="11">{compact.format(value)}</text></g>;
        })}
        {empty && <text x={width / 2} y="145" textAnchor="middle" fill="var(--erp-dark-muted, #64748b)" fontSize="13">No recorded usage</text>}
        {!empty && lines.map((item, index) => {
          const path = monotonePath(item.points);
          return <g key={item.id} opacity={activeSeries && activeSeries !== item.id ? 0.18 : 1} className="transition-opacity motion-reduce:transition-none">
            <path d={`${path} L${x(months.length - 1)},${y(0)} L${x(0)},${y(0)} Z`} fill={`url(#${gradientId}-${index})`} />
            <path d={path} fill="none" stroke={item.color} strokeWidth={activeSeries === item.id ? 3.5 : 2.75} strokeLinecap="round" strokeLinejoin="round" />
            {(months.length === 1 || activeMonth !== null) && <g><circle cx={x(activeMonth ?? 0)} cy={item.points[activeMonth ?? 0][1]} r="10" fill={item.color} fillOpacity="0.13" /><circle cx={x(activeMonth ?? 0)} cy={item.points[activeMonth ?? 0][1]} r="4.5" fill="var(--erp-dark-surface, #fff)" stroke={item.color} strokeWidth="2.5" /></g>}
          </g>;
        })}
        {activeMonth !== null && <line x1={x(activeMonth)} x2={x(activeMonth)} y1={top} y2={bottom} stroke="var(--erp-dark-muted, #64748b)" strokeOpacity="0.5" strokeDasharray="3 5" />}
      </svg>
      {activeMonth !== null && <div role="status" className="absolute top-3 z-10 max-h-56 overflow-y-auto rounded-2xl bg-[#07152d] p-3.5 text-white shadow-xl ring-1 ring-white/10" style={{ width: tooltipWidth, left: tooltipLeft }}>
        <div className="mb-2 flex items-center justify-between gap-3"><span className="text-[11px] font-medium text-white/60">{monthLabel(months[activeMonth])}</span><button type="button" aria-label="Close chart values" onClick={() => { setPinned(null); setSelection(null); }} className="grid size-6 place-items-center rounded-full text-white/70 hover:bg-white/10 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-white">×</button></div>
        <dl className="space-y-2">{lines.map((item) => <div key={item.id} className="flex items-start justify-between gap-3 text-xs"><dt className="flex min-w-0 items-start gap-2 text-white/80"><span className="mt-1 size-1.5 shrink-0 rounded-full" style={{ background: item.color }} /><span className="break-words">{item.label}</span></dt><dd className="shrink-0 font-semibold tabular-nums">{format(item.values[activeMonth] ?? 0)}</dd></div>)}</dl>
        {pinned && <p className="mt-3 text-[10px] text-white/50">Pinned · tap the chart again to release</p>}
      </div>}
    </div>
    {!empty && <div className="flex justify-between gap-1 pl-10" aria-label="Select chart month">{months.map((month, index) => <button key={month} type="button" aria-pressed={activeMonth === index} aria-label={`Show ${monthLabel(month)} values`} onFocus={() => { setPinned(null); setSelection(month); }} onClick={() => setPinned(pinned === month ? null : month)} className={`min-h-9 min-w-0 rounded-lg px-1 text-[11px] font-medium focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-cyan-600 ${activeMonth === index ? "text-cyan-800" : "text-slate-500 hover:text-slate-900"}`}>{monthLabel(month)}</button>)}</div>}
    <p className="mt-3 text-[11px] text-slate-500">Hover or tap to inspect · select a month to pin its values</p>
  </div>;
}
