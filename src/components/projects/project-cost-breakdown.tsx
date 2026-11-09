"use client";

import { useState } from "react";
import { ringSegment, stackSegments } from "@/lib/charts/geometry";

type CostCategory = { label: string; amountCentavos: number | null; color: string };
const money = new Intl.NumberFormat("en-PH", { style: "currency", currency: "PHP", maximumFractionDigits: 2 });
const percent = (part: number, total: number) => `${(part / total * 100).toFixed(1)}%`;

/** Donut of posted project costs. The centre shows the total, or the tapped category. */
export function ProjectCostBreakdown({ categories }: { categories: CostCategory[] }) {
  const [selected, setSelected] = useState<string | null>(null);
  const posted = categories.filter((item) => (item.amountCentavos ?? 0) > 0);
  const total = posted.reduce((sum, item) => sum + (item.amountCentavos ?? 0), 0);
  const active = posted.find((item) => item.label === selected) ?? null;
  const toggle = (label: string) => setSelected((current) => current === label ? null : label);
  const stacked = stackSegments(posted.map((item) => item.amountCentavos ?? 0));
  const segments = posted.map((item, index) => ({ ...item, start: stacked[index].from / total * 2 * Math.PI, end: stacked[index].to / total * 2 * Math.PI }));

  return <section className="@container min-w-0 rounded-2xl border border-slate-200 bg-white p-5 sm:p-6">
    <h2 className="text-base font-semibold">Cost breakdown</h2>
    <p className="mt-1 text-xs text-slate-500">Posted project costs. Tap a category to see its share.</p>
    <div className="mt-6 flex flex-col items-center gap-6 @min-[600px]:flex-row @min-[600px]:gap-8">
      <div className="relative size-56 shrink-0">
        <svg viewBox="0 0 220 220" className="size-full" role="img" aria-label={total > 0 ? `Posted costs ${money.format(total / 100)}: ${posted.map((item) => `${item.label} ${money.format((item.amountCentavos ?? 0) / 100)}`).join(", ")}` : "No posted project costs"}>
          <circle cx="110" cy="110" r="80" fill="none" stroke="var(--erp-dark-border, #e2e8f0)" strokeWidth="28" />
          {segments.map((item) => {
            const gap = segments.length > 1 ? Math.min(0.02, (item.end - item.start) / 6) : 0;
            const dimmed = active !== null && active.label !== item.label;
            return <g key={item.label} opacity={dimmed ? 0.3 : 1} onClick={() => toggle(item.label)} className="cursor-pointer transition-opacity duration-200 motion-reduce:transition-none">
              {segments.length === 1 ? <circle cx="110" cy="110" r="80" fill="none" stroke={item.color} strokeWidth="28" /> : <path d={ringSegment(item.start + gap, item.end - gap)} fill={item.color} />}
              <title>{`${item.label}: ${money.format((item.amountCentavos ?? 0) / 100)} · ${percent(item.amountCentavos ?? 0, total)}`}</title>
            </g>;
          })}
        </svg>
        <div className="pointer-events-none absolute inset-0 flex flex-col items-center justify-center px-10 text-center" aria-live="polite">
          <span className="text-[11px] font-medium text-slate-500">{active ? active.label : "Total costs"}</span>
          <span className="mt-1 text-xl font-semibold tracking-tight tabular-nums text-slate-900">{total > 0 ? money.format((active?.amountCentavos ?? total) / 100) : "₱0.00"}</span>
          {active && <span className="mt-0.5 text-xs font-medium tabular-nums text-slate-500">{percent(active.amountCentavos ?? 0, total)}</span>}
        </div>
      </div>
      <ul className="w-full min-w-0 flex-1 divide-y divide-slate-100">{categories.map((item) => {
        const amount = item.amountCentavos ?? 0;
        const hasCost = amount > 0;
        return <li key={item.label}>
          <button type="button" disabled={!hasCost} aria-pressed={selected === item.label} onClick={() => toggle(item.label)} className={`flex w-full min-w-0 items-center justify-between gap-3 rounded-lg px-2 py-3 text-left transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-cyan-600 motion-reduce:transition-none ${selected === item.label ? "bg-slate-50" : ""} ${hasCost ? "hover:bg-slate-50" : "cursor-default"}`}>
            <span className={`flex min-w-0 items-center gap-2 text-sm ${hasCost ? "text-slate-700" : "text-slate-400"}`}><span className="size-2.5 shrink-0 rounded-full" style={{ backgroundColor: hasCost ? item.color : "var(--erp-dark-border, #cbd5e1)" }} />{item.label}</span>
            <span className="shrink-0 text-right text-sm font-semibold tabular-nums text-slate-900">{item.amountCentavos === null ? "Not posted" : money.format(amount / 100)}{hasCost && <span className="block text-[11px] font-normal text-slate-500">{percent(amount, total)}</span>}</span>
          </button>
        </li>;
      })}</ul>
    </div>
  </section>;
}
