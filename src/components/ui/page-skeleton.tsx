const bar = "animate-pulse rounded-full bg-slate-100 motion-reduce:animate-none";
const panel = "rounded-xl border border-slate-200 bg-white";

function Status({ label }: { label: string }) {
  return <span className="sr-only">{label}</span>;
}

function HeaderBars() {
  return <div aria-hidden className="flex flex-col gap-4 sm:flex-row sm:items-end sm:justify-between">
    <div className="space-y-3"><div className={`h-3 w-28 ${bar}`} /><div className={`h-8 w-72 max-w-full ${bar}`} /><div className={`h-3.5 w-96 max-w-full ${bar}`} /></div>
    <div className={`h-10 w-36 ${bar}`} />
  </div>;
}

function SectionBars({ rows = 4 }: { rows?: number }) {
  return <section aria-hidden className={`${panel} overflow-hidden`}>
    <div className="border-b border-slate-100 px-5 py-4"><div className={`h-4 w-40 ${bar}`} /></div>
    <div className="divide-y divide-slate-100">{Array.from({ length: rows }, (_, row) => <div key={row} className="flex items-center gap-4 px-5 py-4">
      <div className={`size-10 shrink-0 rounded-lg ${bar}`} />
      <div className="flex-1 space-y-2"><div className={`h-3.5 ${bar} ${row % 2 ? "w-1/2" : "w-2/3"}`} /><div className={`h-3 w-1/3 ${bar}`} /></div>
    </div>)}</div>
  </section>;
}

function MetricBars({ count }: { count: number }) {
  return <div aria-hidden className={`grid gap-5 sm:grid-cols-2 ${count === 4 ? "xl:grid-cols-4" : "xl:grid-cols-3"}`}>
    {Array.from({ length: count }, (_, index) => <div key={index} className={`${panel} p-5`}><div className={`size-10 rounded-lg ${bar}`} /><div className={`mt-5 h-3 w-24 ${bar}`} /><div className={`mt-3 h-7 w-20 ${bar}`} /><div className={`mt-3 h-3 w-32 ${bar}`} /></div>)}
  </div>;
}

/** Route loading state for the dashboard: layout appears at once, figures fill in. */
export function DashboardSkeleton() {
  return <div role="status" aria-live="polite">
    <Status label="Loading dashboard" />
    <div aria-hidden className="space-y-3"><div className={`h-8 w-64 ${bar}`} /><div className={`h-3.5 w-80 max-w-full ${bar}`} /></div>
    <div className="mt-8"><MetricBars count={4} /></div>
    <div className="mt-5 grid gap-5 xl:grid-cols-2"><SectionBars /><SectionBars /></div>
    <div aria-hidden className={`mt-5 h-72 ${panel} p-6`}><div className={`h-4 w-40 ${bar}`} /><div className={`mt-6 h-52 rounded-lg ${bar}`} /></div>
  </div>;
}

/** Route loading state for a single record: header, summary figures and sections. */
export function DetailPageSkeleton({ metrics = 3, sections = 2 }: { metrics?: number; sections?: number }) {
  return <div role="status" aria-live="polite">
    <Status label="Loading record" />
    <HeaderBars />
    {metrics > 0 && <div className="mt-8"><MetricBars count={metrics} /></div>}
    <div className="mt-5 grid gap-5 xl:grid-cols-2">{Array.from({ length: sections }, (_, index) => <SectionBars key={index} rows={index ? 3 : 4} />)}</div>
  </div>;
}

/** Route loading state for a create or edit form. */
export function FormPageSkeleton({ fields = 6 }: { fields?: number }) {
  return <div role="status" aria-live="polite">
    <Status label="Loading form" />
    <HeaderBars />
    <div aria-hidden className={`mt-8 max-w-3xl ${panel} p-6`}>
      <div className="grid gap-5 sm:grid-cols-2">{Array.from({ length: fields }, (_, index) => <div key={index} className="space-y-2"><div className={`h-3 w-24 ${bar}`} /><div className={`h-10 w-full rounded-lg ${bar}`} /></div>)}</div>
      <div className="mt-6 flex justify-end gap-3"><div className={`h-10 w-24 ${bar}`} /><div className={`h-10 w-32 ${bar}`} /></div>
    </div>
  </div>;
}
