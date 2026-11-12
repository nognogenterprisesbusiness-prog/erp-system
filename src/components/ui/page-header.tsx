import { RecordFacts, type RecordFact } from "./record-facts";

export function PageHeader({ eyebrow, title, description, facts, action }: { eyebrow?: string; title: string; description?: string; facts?: readonly RecordFact[]; action?: React.ReactNode }) {
  return <div className="flex flex-wrap items-start justify-between gap-4">
    <div className="min-w-0 flex-1 basis-64">
      {eyebrow && <p className="text-xs font-semibold tracking-wide text-cyan-700">{eyebrow}</p>}
      <h1 className={`${eyebrow ? "mt-1.5 " : ""}break-words text-2xl font-semibold tracking-tight text-[#07152d] sm:text-3xl`}>{title}</h1>
      {description && <p className="mt-2 max-w-3xl text-sm leading-6 text-slate-500">{description}</p>}
      {facts && <RecordFacts items={facts} className="mt-3 max-w-3xl" />}
    </div>
    {action && <div className="flex w-full max-w-full flex-wrap items-center gap-2 sm:w-auto sm:justify-end">{action}</div>}
  </div>;
}
