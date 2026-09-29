import { PageHeader } from "@/components/ui/page-header";

const bar = "animate-pulse rounded-full bg-slate-100 motion-reduce:animate-none";

/** Placeholder for a list's filters and table while its records stream in. */
export function TableSkeleton({ columns = 5, rows = 6, filters = 2 }: { columns?: number; rows?: number; filters?: number }) {
  const cells = Array.from({ length: columns }, (_, index) => index);
  return <div role="status" aria-live="polite">
    <span className="sr-only">Loading records</span>
    {filters > 0 && <div className="mt-7 flex flex-wrap gap-3" aria-hidden>{Array.from({ length: filters }, (_, index) => <div key={index} className={`h-10 ${bar} ${index === 0 ? "w-full sm:w-80" : "w-44"}`} />)}</div>}
    <div className="mt-5 overflow-hidden rounded-xl border border-slate-200 bg-white" aria-hidden>
      <div className="flex gap-6 border-b border-slate-100 bg-slate-50 px-5 py-3.5">{cells.map((cell) => <div key={cell} className={`h-2.5 flex-1 ${bar}`} />)}</div>
      <div className="divide-y divide-slate-100">{Array.from({ length: rows }, (_, row) => <div key={row} className="flex items-center gap-6 px-5 py-4">{cells.map((cell) => <div key={cell} className={`h-3.5 flex-1 ${bar} ${cell === 0 ? "max-w-56" : ""}`} />)}</div>)}</div>
    </div>
  </div>;
}

/** Route loading state: the real page title stays visible, only the records are placeholders. */
export function ListPageSkeleton({ eyebrow, title, description, ...table }: { eyebrow?: string; title: string; description?: string } & Parameters<typeof TableSkeleton>[0]) {
  return <><PageHeader eyebrow={eyebrow} title={title} description={description} /><TableSkeleton {...table} /></>;
}
