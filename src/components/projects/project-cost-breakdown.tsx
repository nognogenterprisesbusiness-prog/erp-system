type CostCategory = { label: string; amountCentavos: number | null; color: string };

const money = new Intl.NumberFormat("en-PH", { style: "currency", currency: "PHP", maximumFractionDigits: 2 });

export function ProjectCostBreakdown({ categories }: { categories: CostCategory[] }) {
  const posted = categories.filter((item) => item.amountCentavos !== null && item.amountCentavos > 0);
  const total = posted.reduce((sum, item) => sum + (item.amountCentavos ?? 0), 0);
  let angle = 0;
  const segments = posted.map((item) => {
    const start = angle;
    angle += (item.amountCentavos ?? 0) / total * 100;
    return `${item.color} ${start}% ${angle}%`;
  });
  const background = total > 0 ? `conic-gradient(${segments.join(", ")})` : "var(--erp-dark-inset, #e2e8f0)";
  return <section className="min-w-0 rounded-2xl border border-slate-200 bg-white p-5 sm:p-6">
    <div className="flex flex-wrap items-start justify-between gap-3"><div><h2 className="text-base font-semibold">Cost breakdown</h2><p className="mt-1 text-xs text-slate-500">Posted project costs only; unrecorded categories are not estimated.</p></div><p className="text-lg font-semibold tabular-nums">{money.format(total / 100)}</p></div>
    <div className="mt-5 flex flex-wrap items-center gap-6 sm:flex-nowrap">
      <div role="img" aria-label={total > 0 ? `Posted cost chart: ${posted.map((item) => `${item.label} ${money.format((item.amountCentavos ?? 0) / 100)}`).join(", ")}` : "No posted project costs"} className="grid size-36 shrink-0 place-items-center rounded-full" style={{ background }}><div className="grid size-24 place-items-center rounded-full bg-white text-center"><span className="text-xs font-semibold text-slate-700">{total > 0 ? "Posted costs" : "No costs"}</span></div></div>
      <dl className="grid min-w-0 flex-1 gap-3 sm:grid-cols-2">{categories.map((item) => <div key={item.label} className="min-w-0"><dt className="flex items-center gap-2 text-xs text-slate-500"><span className="size-2.5 shrink-0 rounded-full" style={{ backgroundColor: item.color }} />{item.label}</dt><dd className="mt-1 pl-[18px] text-sm font-semibold tabular-nums text-slate-800">{item.amountCentavos === null ? "Not posted" : money.format(item.amountCentavos / 100)}</dd></div>)}</dl>
    </div>
  </section>;
}
