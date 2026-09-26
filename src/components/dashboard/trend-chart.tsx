"use client";

import { useState } from "react";
import { SelectPicker } from "@/components/ui/select-picker";

export type TrendSeries = { id: string; label: string; values: number[]; unit: string };
const colors = ["#0891b2", "#d97706", "#059669", "#8b5cf6", "#64748b"];

export function TrendChart({ months, series, currency = false, area = false }: { months: string[]; series: TrendSeries[]; currency?: boolean; area?: boolean }) {
  const units = [...new Set(series.map((item) => item.unit))];
  const [selectedUnit, setSelectedUnit] = useState(units[0] ?? "");
  const [selectedMonth, setSelectedMonth] = useState<number | null>(null);
  const visible = series.filter((item) => currency || item.unit === selectedUnit);
  const empty = visible.length === 0;
  const maximum = Math.max(1, ...visible.flatMap((item) => item.values));
  const ceiling = Math.ceil(maximum / Math.pow(10, Math.floor(Math.log10(maximum)))) * Math.pow(10, Math.floor(Math.log10(maximum)));
  const format = (value: number) => currency ? new Intl.NumberFormat("en-PH", { style: "currency", currency: "PHP", maximumFractionDigits: 0 }).format(value) : `${value.toLocaleString("en-PH", { maximumFractionDigits: 3 })} ${selectedUnit}`;
  const x = (index: number) => 75 + index * 500 / Math.max(1, months.length - 1);
  const y = (value: number) => 230 - value / ceiling * 190;
  const monthLabel = (month: string) => new Intl.DateTimeFormat("en-PH", { month: "short", year: "2-digit", timeZone: "Asia/Manila" }).format(new Date(`${month}T12:00:00Z`));
  return <div className="mt-4">
    {units.length > 1 && !currency && <div className="mb-2 w-44"><SelectPicker label="Chart unit" value={selectedUnit} onValueChange={(value) => { setSelectedUnit(value); setSelectedMonth(null); }} options={units.map((unit) => ({ value: unit, label: unit }))} /></div>}
    <svg viewBox="0 0 610 275" className="w-full" role="img" aria-label={empty ? "Material consumption chart: no recorded usage" : currency ? "Monthly posted expenses by category" : `Monthly material consumption in ${selectedUnit}`}>
      {[0, 1, 2, 3, 4].map((tick) => <g key={tick}><line x1="75" x2="575" y1={y(ceiling * tick / 4)} y2={y(ceiling * tick / 4)} className="stroke-slate-200" strokeDasharray="3 4" />{!empty && <text x="65" y={y(ceiling * tick / 4) + 4} textAnchor="end" className="fill-slate-500" fontSize="11">{new Intl.NumberFormat("en-PH", { notation: "compact", maximumFractionDigits: 1 }).format(ceiling * tick / 4)}</text>}</g>)}
      {empty && <text x="325" y="135" textAnchor="middle" className="fill-slate-500" fontSize="14">No recorded usage</text>}
      {visible.map((item, index) => { const points = item.values.map((value, month) => `${x(month)},${y(value)}`).join(" "); return <g key={item.id}>{area && <polygon points={`75,230 ${points} ${x(months.length - 1)},230`} fill={colors[index % colors.length]} fillOpacity="0.12" />}<polyline points={points} fill="none" stroke={colors[index % colors.length]} strokeWidth="2" strokeLinejoin="round" />{item.values.map((value, month) => <circle key={month} cx={x(month)} cy={y(value)} r="3" fill="var(--background, white)" stroke={colors[index % colors.length]}><title>{`${monthLabel(months[month])}: ${item.label} ${format(value)}`}</title></circle>)}</g>; })}
      {months.map((month, index) => <g key={month}><text x={x(index)} y="253" textAnchor="middle" className="fill-slate-500" fontSize="11">{monthLabel(month)}</text><rect x={x(index) - 25} y="35" width="50" height="200" fill="transparent" onMouseEnter={() => setSelectedMonth(index)} onMouseLeave={() => setSelectedMonth(null)} onClick={() => setSelectedMonth(index)}><title>{visible.map((item) => `${item.label}: ${format(item.values[index] ?? 0)}`).join("; ")}</title></rect></g>)}
    </svg>
    <div className="flex flex-wrap justify-center gap-x-4 gap-y-2 text-xs text-slate-600">{visible.map((item, index) => <span key={item.id}><i className="mr-1.5 inline-block size-2 rounded-full" style={{ backgroundColor: colors[index % colors.length] }} />{item.label}{selectedMonth !== null ? `: ${format(item.values[selectedMonth] ?? 0)}` : ""}</span>)}</div>
    {!empty && <details className="mt-3 text-xs text-slate-500"><summary className="cursor-pointer">View chart data</summary><div className="mt-2 overflow-x-auto"><table className="w-full text-left"><caption className="sr-only">Monthly chart values</caption><thead><tr><th className="p-2">Month</th>{visible.map((item) => <th key={item.id} className="p-2">{item.label}</th>)}</tr></thead><tbody>{months.map((month, index) => <tr key={month}><th className="p-2 font-normal">{monthLabel(month)}</th>{visible.map((item) => <td key={item.id} className="p-2">{format(item.values[index] ?? 0)}</td>)}</tr>)}</tbody></table></div></details>}
  </div>;
}
