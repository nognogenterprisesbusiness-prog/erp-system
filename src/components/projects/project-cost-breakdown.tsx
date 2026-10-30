"use client";

import { useState } from "react";

type CostCategory = { label: string; amountCentavos: number | null; color: string };
const money = new Intl.NumberFormat("en-PH", { style: "currency", currency: "PHP", maximumFractionDigits: 2 });

export function ProjectCostBreakdown({ categories }: { categories: CostCategory[] }) {
  const [highlighted, setHighlighted] = useState<string | null>(null);
  const posted = categories.filter((item) => item.amountCentavos !== null && item.amountCentavos > 0);
  const total = posted.reduce((sum, item) => sum + (item.amountCentavos ?? 0), 0);
  const active = categories.find((item) => item.label === highlighted);
  const circumference = 2 * Math.PI * 78;
  const segments = posted.map((item, index) => ({ ...item, fraction: (item.amountCentavos ?? 0) / total, offset: posted.slice(0, index).reduce((sum, previous) => sum + (previous.amountCentavos ?? 0) / total, 0) }));

  return <section className="@container min-w-0 rounded-2xl border border-slate-200 bg-white p-5 sm:p-6">
    <div className="flex flex-wrap items-start justify-between gap-3"><div><h2 className="text-base font-semibold">Cost breakdown</h2><p className="mt-1 text-xs text-slate-500">Posted project costs only; unrecorded categories are not estimated.</p></div><p className="text-xl font-semibold tracking-tight tabular-nums">{money.format(total / 100)}</p></div>
    <div className="mt-6 flex flex-col items-center gap-6 @min-[560px]:flex-row @min-[560px]:gap-8">
      <div className="relative size-48 shrink-0">
        <svg viewBox="0 0 200 200" className="size-full overflow-visible" role="img" aria-label={total > 0 ? `Posted cost chart: ${posted.map((item) => `${item.label} ${money.format((item.amountCentavos ?? 0) / 100)}`).join(", ")}` : "No posted project costs"}>
          <circle cx="100" cy="100" r="78" fill="none" className="stroke-slate-200" strokeWidth="24" opacity="0.35" />
          {segments.map((item) => {
            const length = item.fraction * circumference;
            const gap = segments.length === 1 ? 0 : Math.min(4, length * 0.15);
            return <circle key={item.label} cx="100" cy="100" r="78" fill="none" stroke={item.color} strokeWidth={highlighted === item.label ? 29 : 24} strokeDasharray={`${length - gap} ${circumference - length + gap}`} strokeDashoffset={-item.offset * circumference - gap / 2} transform="rotate(-90 100 100)" opacity={!active || highlighted === item.label ? 1 : 0.25} className="transition-[opacity,stroke-width] duration-200 motion-reduce:transition-none" onPointerEnter={() => setHighlighted(item.label)} onPointerLeave={() => setHighlighted(null)} onClick={() => setHighlighted(item.label)}><title>{`${item.label}: ${money.format((item.amountCentavos ?? 0) / 100)} · ${(item.fraction * 100).toFixed(1)}%`}</title></circle>;
          })}
        </svg>
        <div className="pointer-events-none absolute inset-0 flex flex-col items-center justify-center px-9 text-center" aria-hidden="true"><span className="text-2xl font-semibold tracking-tight tabular-nums text-slate-900">{active && active.amountCentavos !== null && total > 0 ? `${(active.amountCentavos / total * 100).toFixed(1)}%` : total > 0 ? "100%" : "—"}</span><span className="mt-1 text-xs leading-4 text-slate-500">{active?.label ?? (total > 0 ? "Posted costs" : "No posted costs")}</span></div>
      </div>
      <dl className="grid w-full min-w-0 flex-1 grid-cols-2 gap-2">{categories.map((item) => <div key={item.label} className={`min-w-0 rounded-xl border p-3 transition-colors motion-reduce:transition-none ${highlighted === item.label ? "border-slate-200 bg-slate-50" : "border-transparent"}`}>
        <dt><button type="button" aria-pressed={highlighted === item.label} aria-label={`Highlight ${item.label} costs`} onPointerEnter={() => setHighlighted(item.label)} onPointerLeave={() => setHighlighted(null)} onFocus={() => setHighlighted(item.label)} onBlur={() => setHighlighted(null)} onClick={() => setHighlighted(item.label)} className="flex min-h-8 w-full items-center gap-2 rounded-md text-left text-xs text-slate-500 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-cyan-600"><span className="size-2.5 shrink-0 rounded-full" style={{ backgroundColor: item.color }} />{item.label}</button></dt>
        <dd className="mt-1 text-sm font-semibold tabular-nums text-slate-900">{item.amountCentavos === null ? "Not posted" : money.format(item.amountCentavos / 100)}{item.amountCentavos !== null && total > 0 && <span className="mt-1 block text-xs font-normal text-slate-500">{(item.amountCentavos / total * 100).toFixed(1)}%</span>}</dd>
      </div>)}</dl>
    </div>
  </section>;
}
