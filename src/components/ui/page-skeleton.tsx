type Variant = "dashboard" | "table" | "gallery";

const bar = "rounded-full bg-slate-100";

function HeadingSkeleton() {
  return <div className="space-y-3" aria-hidden="true"><div className={`h-3 w-28 ${bar}`} /><div className={`h-8 w-52 ${bar}`} /><div className={`h-3 w-64 max-w-full ${bar}`} /></div>;
}

function TableSkeleton() {
  return <>
    <div className="mt-6 flex flex-wrap items-center justify-between gap-3 rounded-xl border border-slate-200 bg-white p-4" aria-hidden="true"><div className={`h-10 w-64 max-w-full ${bar}`} /><div className="flex gap-2"><div className={`h-10 w-28 ${bar}`} /><div className={`h-10 w-24 ${bar}`} /></div></div>
    <div className="mt-5 overflow-hidden rounded-xl border border-slate-200 bg-white" aria-hidden="true"><div className="flex gap-6 border-b border-slate-200 bg-slate-50 px-5 py-4"><div className={`h-3 w-20 ${bar}`} /><div className={`h-3 w-36 ${bar}`} /><div className={`h-3 w-24 ${bar}`} /></div>{Array.from({ length: 6 }, (_, index) => <div key={index} className="flex items-center gap-4 border-b border-slate-100 px-5 py-4 last:border-0"><div className="size-10 shrink-0 rounded-lg bg-slate-100" /><div className="min-w-0 flex-1 space-y-2"><div className={`${bar} h-3 w-40 max-w-full`} /><div className={`${bar} h-2.5 w-24`} /></div><div className={`${bar} h-3 w-16`} /></div>)}</div>
  </>;
}

function DashboardSkeleton() {
  return <><div className="mt-7 grid grid-cols-2 gap-3 xl:grid-cols-4" aria-hidden="true">{Array.from({ length: 4 }, (_, index) => <div key={index} className="h-32 rounded-2xl border border-slate-200 bg-white p-5"><div className={`h-3 w-24 ${bar}`} /><div className={`mt-5 h-8 w-16 ${bar}`} /></div>)}</div><div className="mt-5 grid items-start gap-5 xl:grid-cols-2" aria-hidden="true">{Array.from({ length: 2 }, (_, panel) => <div key={panel} className="rounded-2xl border border-slate-200 bg-white"><div className="border-b border-slate-100 p-5"><div className={`h-4 w-36 ${bar}`} /></div>{Array.from({ length: 3 }, (_, row) => <div key={row} className="flex items-center gap-3 border-b border-slate-100 p-5 last:border-0"><div className="size-12 shrink-0 rounded-lg bg-slate-100" /><div className="flex-1 space-y-2"><div className={`h-3 w-32 ${bar}`} /><div className={`h-2.5 w-48 max-w-full ${bar}`} /></div></div>)}</div>)}</div></>;
}

function GallerySkeleton() {
  return <><div className="mt-6 h-14 rounded-xl border border-slate-200 bg-white" aria-hidden="true" /><div className="mt-5 grid gap-5 md:grid-cols-2 xl:grid-cols-3" aria-hidden="true">{Array.from({ length: 6 }, (_, index) => <div key={index} className="overflow-hidden rounded-2xl border border-slate-200 bg-white"><div className="h-32 bg-slate-100" /><div className="space-y-3 p-5"><div className={`h-3 w-20 ${bar}`} /><div className={`h-5 w-40 ${bar}`} /><div className={`h-3 w-28 ${bar}`} /></div></div>)}</div></>;
}

export function PageSkeleton({ variant = "table", showHeading = true }: { variant?: Variant; showHeading?: boolean }) {
  return <div role="status" aria-busy="true" aria-label="Loading page" className="motion-safe:animate-pulse">
    {showHeading && <HeadingSkeleton />}
    {variant === "dashboard" ? <DashboardSkeleton /> : variant === "gallery" ? <GallerySkeleton /> : <TableSkeleton />}
    <span className="sr-only">Loading page content…</span>
  </div>;
}
