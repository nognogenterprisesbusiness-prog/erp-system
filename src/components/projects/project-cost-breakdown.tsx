import { IntentLink as Link } from "@/components/layout/intent-link";
import { Button } from "@/components/ui/button";
import { ringSegment, stackSegments } from "@/lib/charts/geometry";
import type { ProjectCostCategory } from "@/lib/projects/cost-breakdown";

const money = new Intl.NumberFormat("en-PH", { style: "currency", currency: "PHP" });
const compactMoney = new Intl.NumberFormat("en-PH", { style: "currency", currency: "PHP", notation: "compact", maximumFractionDigits: 1 });

export function ProjectCostBreakdown({ categories }: { categories: ProjectCostCategory[] }) {
  const posted = categories.filter((item) => item.amountCentavos > 0);
  const total = posted.reduce((sum, item) => sum + item.amountCentavos, 0);
  const stacked = stackSegments(posted.map((item) => item.amountCentavos));
  return <section className="@container min-w-0 rounded-2xl border border-slate-200 bg-white p-5 sm:p-6">
    <div className="flex flex-wrap items-start justify-between gap-3">
      <div><h2 className="text-base font-semibold">Detailed cost breakdown</h2><p className="mt-1 text-sm text-slate-500">Posted costs only. Reversed entries are excluded.</p></div>
      <div className="min-w-0"><p className="text-xs text-slate-500">Total actual costs</p><p className="break-words text-lg font-semibold tabular-nums">{money.format(total / 100)}</p></div>
    </div>
    {total === 0 ? <p className="mt-5 rounded-xl bg-slate-50 p-4 text-sm leading-6 text-slate-600">No costs posted yet. Material use, attendance, equipment hours and posted expenses will appear here.</p> : <div className="mt-5 grid items-start gap-5 @min-[600px]:grid-cols-[180px_minmax(0,1fr)] @min-[900px]:grid-cols-[200px_minmax(0,1fr)]">
      <div className="relative mx-auto size-44 @min-[900px]:size-48">
        <svg viewBox="0 0 220 220" className="size-full" role="img" aria-label={`Cost shares: ${posted.map((item) => `${item.label} ${money.format(item.amountCentavos / 100)}`).join(", ")}`}>
          {posted.map((item, index) => {
            const start = stacked[index].from / total * 2 * Math.PI;
            const end = stacked[index].to / total * 2 * Math.PI;
            const gap = Math.min(0.02, (end - start) / 6);
            return <g key={item.label}>
              {posted.length === 1 ? <circle cx="110" cy="110" r="80" fill="none" stroke={item.color} strokeWidth="28" /> : <path d={ringSegment(start + gap, end - gap)} fill={item.color} />}
              <title>{`${item.label}: ${money.format(item.amountCentavos / 100)} (${(item.amountCentavos / total * 100).toFixed(1)}%)`}</title>
            </g>;
          })}
        </svg>
        <div className="pointer-events-none absolute inset-0 flex flex-col items-center justify-center px-9 text-center"><span className="text-xs text-slate-500">Total costs</span><span className="mt-1 text-xl font-semibold tabular-nums">{compactMoney.format(total / 100)}</span></div>
      </div>
      <ul className="min-w-0 divide-y divide-slate-100">{posted.map((item) => <li key={item.label} className="grid grid-cols-[minmax(0,1fr)_auto] items-start gap-x-3 gap-y-1 py-3 first:pt-0">
        <div className="flex min-w-0 items-start gap-2"><span aria-hidden="true" className="mt-1.5 size-2.5 shrink-0 rounded-full" style={{ backgroundColor: item.color }} /><div className="min-w-0"><p className="text-sm font-medium text-slate-800">{item.label}</p>{item.detail && <p className="mt-1 text-xs text-slate-500">{item.detail}</p>}</div></div>
        <div className="text-right"><p className="text-sm font-semibold tabular-nums">{money.format(item.amountCentavos / 100)}</p><p className="mt-1 text-xs tabular-nums text-slate-500">{(item.amountCentavos / total * 100).toFixed(1)}%</p></div>
        {(item.href || item.relatedLinks?.length) ? <div className="col-span-2 mt-2 flex flex-wrap gap-2 pl-4">
          {item.href && <Button variant="outline" size="sm" asChild><Link href={item.href} aria-label={`${item.actionLabel ?? "View entries"} for ${item.label}`}>{item.actionLabel ?? "View entries"}</Link></Button>}
          {item.relatedLinks?.map(link => <Button key={link.href} variant="outline" size="sm" asChild><Link href={link.href}>{link.label}</Link></Button>)}
        </div> : null}
      </li>)}</ul>
    </div>}
  </section>;
}
