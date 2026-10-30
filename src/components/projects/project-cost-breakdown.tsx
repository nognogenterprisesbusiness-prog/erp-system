"use client";

import { useState } from "react";
import { ringSegment } from "@/lib/charts/geometry";

type CostCategory = { label: string; amountCentavos: number | null; color: string };
const money = new Intl.NumberFormat("en-PH", { style: "currency", currency: "PHP", maximumFractionDigits: 2 });

export function ProjectCostBreakdown({ categories }: { categories: CostCategory[] }) {
  const [highlighted, setHighlighted] = useState<string | null>(null);
  const posted = categories.filter((item) => item.amountCentavos !== null && item.amountCentavos > 0);
  const total = posted.reduce((sum, item) => sum + (item.amountCentavos ?? 0), 0);
  const active = categories.find((item) => item.label === highlighted);
  const segments = posted.map((item, index) => ({ ...item, fraction: (item.amountCentavos ?? 0) / total, offset: posted.slice(0, index).reduce((sum, previous) => sum + (previous.amountCentavos ?? 0) / total, 0) }));

  return <section className="@container min-w-0 rounded-2xl border border-slate-200 bg-white p-5 sm:p-6">
    <div className="flex flex-wrap items-start justify-between gap-3"><div><h2 className="text-base font-semibold">Cost breakdown</h2><p className="mt-1 text-xs text-slate-500">Posted project costs only; unrecorded categories are not estimated.</p></div><p className="text-xl font-semibold tracking-tight tabular-nums">{money.format(total / 100)}</p></div>
    <div className="mt-6 flex flex-col items-center gap-6 @min-[600px]:flex-row @min-[600px]:gap-8">
      <div className="relative size-60 shrink-0">
        <svg viewBox="0 0 220 220" className="size-full overflow-visible" role="img" aria-label={total > 0 ? `Posted cost chart: ${posted.map((item) => `${item.label} ${money.format((item.amountCentavos ?? 0) / 100)}`).join(", ")}` : "No posted project costs"}>
          {!posted.length && <circle cx="110" cy="110" r="80" fill="none" stroke="var(--erp-dark-border, #e2e8f0)" strokeWidth="28" />}
          {segments.map((item) => {
            const start = item.offset * 2 * Math.PI, end = start + item.fraction * 2 * Math.PI;
            const gap = Math.min(0.025, (end - start) / 6);
            const middle = (start + end) / 2;
            const lifted = highlighted === item.label;
            const handlers = { onPointerEnter: () => setHighlighted(item.label), onPointerLeave: () => setHighlighted(null), onClick: () => setHighlighted(item.label) };
            return <g key={item.label} style={{ transform: lifted ? `translate(${Math.sin(middle) * 5}px, ${-Math.cos(middle) * 5}px)` : undefined }} opacity={!active || lifted ? 1 : 0.25} className="transition-[transform,opacity] duration-200 motion-reduce:transition-none" {...handlers}>{segments.length === 1 ? <circle cx="110" cy="110" r="80" fill="none" stroke={item.color} strokeWidth="28" /> : <path d={ringSegment(start + gap, end - gap)} fill={item.color} />}<title>{`${item.label}: ${money.format((item.amountCentavos ?? 0) / 100)} · ${(item.fraction * 100).toFixed(1)}%`}</title></g>;
          })}
        </svg>
        <div className="pointer-events-none absolute inset-0 flex flex-col items-center justify-center px-12 text-center" aria-hidden="true"><span className="text-[10px] font-medium uppercase tracking-[0.12em] text-slate-500">{active ? "Share of costs" : "Recorded"}</span><span className="mt-1 text-3xl font-semibold tracking-[-0.05em] tabular-nums text-slate-900">{active && active.amountCentavos !== null && total > 0 ? `${(active.amountCentavos / total * 100).toFixed(1)}%` : total > 0 ? "100%" : "—"}</span><span className="mt-1 text-xs leading-4 text-slate-500">{active?.label ?? (total > 0 ? "Posted costs" : "No posted costs")}</span></div>
      </div>
      <dl className="w-full min-w-0 flex-1 divide-y divide-slate-100">{categories.map((item) => <div key={item.label} className={`flex min-w-0 items-center justify-between gap-3 rounded-lg px-2 py-3 transition-colors motion-reduce:transition-none ${highlighted === item.label ? "bg-slate-50" : ""}`}>
        <dt><button type="button" aria-pressed={highlighted === item.label} aria-label={`Highlight ${item.label} costs`} onPointerEnter={() => setHighlighted(item.label)} onPointerLeave={() => setHighlighted(null)} onFocus={() => setHighlighted(item.label)} onBlur={() => setHighlighted(null)} onClick={() => setHighlighted(item.label)} className="flex min-h-8 w-full items-center gap-2 rounded-md text-left text-xs text-slate-500 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-cyan-600"><span className="size-2.5 shrink-0 rounded-full" style={{ backgroundColor: item.color }} />{item.label}</button></dt>
        <dd className="shrink-0 text-right text-sm font-semibold tabular-nums text-slate-900">{item.amountCentavos === null ? "Not posted" : money.format(item.amountCentavos / 100)}{item.amountCentavos !== null && total > 0 && <span className="mt-1 block text-[11px] font-normal text-slate-500">{(item.amountCentavos / total * 100).toFixed(1)}%</span>}</dd>
      </div>)}</dl>
    </div>
  </section>;
}
