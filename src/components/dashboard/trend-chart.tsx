"use client";

import { useId, useState } from "react";
import { SelectPicker } from "@/components/ui/select-picker";
import { chartScale, monthPosition } from "@/lib/charts/geometry";

export type TrendSeries = { id: string; label: string; values: number[]; unit: string };
const colors = ["var(--chart-cyan, #0891b2)", "var(--chart-amber, #d97706)", "var(--chart-emerald, #059669)", "var(--chart-violet, #8b5cf6)", "var(--chart-slate, #64748b)"];
const compact = new Intl.NumberFormat("en-PH", { notation: "compact", maximumFractionDigits: 1 });
const monthLabel = (month: string) => new Intl.DateTimeFormat("en-PH", { month: "short", year: "2-digit", timeZone: "Asia/Manila" }).format(new Date(`${month}T12:00:00Z`));
const left = 60, right = 620, top = 24, bottom = 240;

export function TrendChart({ months, series, currency = false, area = false }: { months: string[]; series: TrendSeries[]; currency?: boolean; area?: boolean }) {
  const gradientId = useId().replaceAll(":", "");
  const units = [...new Set(series.map((item) => item.unit))];
  const [unit, setUnit] = useState(units[0] ?? "");
  const [selectedMonth, setSelectedMonth] = useState<number | null>(null);
  const [highlighted, setHighlighted] = useState<string | null>(null);
  const selectedUnit = units.includes(unit) ? unit : units[0] ?? "";
  const visible = series.filter((item) => currency || item.unit === selectedUnit);
  const empty = visible.length === 0 || months.length === 0;
  const activeMonth = empty ? null : selectedMonth !== null && selectedMonth < months.length ? selectedMonth : months.length - 1;
  const activeSeries = visible.some((item) => item.id === highlighted) ? highlighted : null;
  const scale = chartScale(visible.flatMap((item) => item.values));
  const x = (index: number) => monthPosition(index, months.length, left, right);
  const y = (value: number) => bottom - (value - scale.minimum) / (scale.maximum - scale.minimum) * (bottom - top);
  const format = (value: number) => currency ? new Intl.NumberFormat("en-PH", { style: "currency", currency: "PHP", maximumFractionDigits: 2 }).format(value) : `${value.toLocaleString("en-PH", { maximumFractionDigits: 4 })} ${selectedUnit}`;

  return <div className="erp-trend-chart mt-5 min-w-0">
    <div className="mb-3 flex min-h-8 flex-wrap items-center justify-between gap-3">
      <span className="text-xs font-medium text-slate-500">{currency ? "Philippine peso · PHP" : selectedUnit ? `Quantity · ${selectedUnit}` : "Material quantity"}</span>
      {units.length > 1 && !currency && <div className="w-32"><SelectPicker label="Chart unit" value={selectedUnit} onValueChange={(value) => { setUnit(value); setSelectedMonth(null); setHighlighted(null); }} options={units.map((value) => ({ value, label: value }))} /></div>}
    </div>
    <div className="relative">
      <div className="relative">
      <svg viewBox="0 0 650 270" className="block w-full overflow-visible" role="img" aria-label={empty ? "No recorded usage" : currency ? "Monthly posted expenses by category. Select a month below for exact values." : `Monthly material consumption in ${selectedUnit}. Select a month below for exact values.`}>
        <defs>{visible.map((item, index) => <linearGradient key={item.id} id={`${gradientId}-${index}`} x1="0" y1="0" x2="0" y2="1"><stop offset="0%" stopColor={colors[index % colors.length]} stopOpacity="0.2" /><stop offset="100%" stopColor={colors[index % colors.length]} stopOpacity="0.015" /></linearGradient>)}</defs>
        {Array.from({ length: 5 }, (_, tick) => {
          const value = scale.minimum + (scale.maximum - scale.minimum) * tick / 4;
          return <line key={tick} x1={left} x2={right} y1={y(value)} y2={y(value)} stroke="var(--erp-dark-border, #e2e8f0)" strokeOpacity="0.65" strokeDasharray={value === 0 ? undefined : "2 5"} />;
        })}
        {empty && <text x="340" y="135" textAnchor="middle" fill="var(--erp-dark-muted, #64748b)" fontSize="14">No recorded usage</text>}
        {!empty && visible.map((item, index) => {
          const points = months.map((_, month) => `${x(month)},${y(item.values[month] ?? 0)}`).join(" ");
          const color = colors[index % colors.length];
          return <g key={item.id} opacity={activeSeries && activeSeries !== item.id ? 0.2 : 1} className="transition-opacity motion-reduce:transition-none">
            {area && <polygon points={`${x(0)},${y(0)} ${points} ${x(months.length - 1)},${y(0)}`} fill={`url(#${gradientId}-${index})`} />}
            <polyline points={points} fill="none" stroke={color} strokeWidth="2.5" strokeLinejoin="round" strokeLinecap="round" />
            {months.map((month, i) => <circle key={month} cx={x(i)} cy={y(item.values[i] ?? 0)} r={activeMonth === i ? 5 : 3} fill="var(--erp-dark-surface, #fff)" stroke={color} strokeWidth="2"><title>{`${monthLabel(month)}: ${item.label} ${format(item.values[i] ?? 0)}`}</title></circle>)}
          </g>;
        })}
        {!empty && activeMonth !== null && <line x1={x(activeMonth)} x2={x(activeMonth)} y1={top} y2={bottom} className="pointer-events-none stroke-slate-400" strokeDasharray="4 4" />}
        {!empty && months.map((month, index) => {
          const start = index === 0 ? left : (x(index - 1) + x(index)) / 2;
          const end = index === months.length - 1 ? right : (x(index) + x(index + 1)) / 2;
          return <rect key={month} x={start} y={top} width={Math.max(1, end - start)} height={bottom - top} fill="transparent" onPointerEnter={() => setSelectedMonth(index)} onPointerMove={() => setSelectedMonth(index)} onClick={() => setSelectedMonth(index)}><title>{`${monthLabel(month)}: ${visible.map((item) => `${item.label} ${format(item.values[index] ?? 0)}`).join("; ")}`}</title></rect>;
        })}
      </svg>
      {!empty && Array.from({ length: 5 }, (_, tick) => {
        const value = scale.minimum + (scale.maximum - scale.minimum) * tick / 4;
        return <span key={tick} aria-hidden="true" className="pointer-events-none absolute left-0 w-[7.38%] -translate-y-1/2 text-right text-[10px] tabular-nums text-slate-500" style={{ top: `${y(value) / 270 * 100}%` }}>{compact.format(value)}</span>;
      })}
      </div>
      {!empty && <div className="ml-[9.23%] mr-[4.62%] flex justify-between gap-1" aria-label="Select chart month">{months.map((month, index) => <button key={month} type="button" aria-pressed={activeMonth === index} aria-label={`Show ${monthLabel(month)} values`} onFocus={() => setSelectedMonth(index)} onClick={() => setSelectedMonth(index)} onKeyDown={(event) => { if (event.key === "Escape") setSelectedMonth(null); }} className={`min-h-9 min-w-0 rounded-lg px-1 text-[11px] font-medium transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-cyan-600 ${activeMonth === index ? "bg-cyan-50 text-cyan-800" : "text-slate-500 hover:bg-slate-50"}`}>{monthLabel(month)}</button>)}</div>}
    </div>
    <div className="mt-4 rounded-xl border border-slate-200 bg-slate-50/60 p-3 sm:p-4">
      <p className="mb-3 text-xs font-medium text-slate-500">{activeMonth !== null ? monthLabel(months[activeMonth]) : "Select a month to see exact values"}</p>
      <dl className="grid gap-x-5 gap-y-3 sm:grid-cols-2" aria-live="polite" aria-atomic="true">{visible.map((item, index) => <div key={item.id} className="min-w-0">
        <dt><button type="button" aria-pressed={activeSeries === item.id} aria-label={`Highlight ${item.label}`} onPointerEnter={() => setHighlighted(item.id)} onPointerLeave={() => setHighlighted(null)} onFocus={() => setHighlighted(item.id)} onBlur={() => setHighlighted(null)} onClick={() => setHighlighted(item.id)} className="flex min-h-8 max-w-full items-center gap-2 rounded-md text-left text-xs text-slate-600 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-cyan-600"><span className="h-2 w-5 shrink-0 rounded-full" style={{ backgroundColor: colors[index % colors.length] }} /><span className="break-words">{item.label}</span></button></dt>
        <dd className="pl-7 text-sm font-semibold tabular-nums text-slate-900">{activeMonth !== null ? format(item.values[activeMonth] ?? 0) : "—"}</dd>
      </div>)}</dl>
      {empty && <p className="text-sm text-slate-500">Posted activity will appear here.</p>}
    </div>
  </div>;
}
