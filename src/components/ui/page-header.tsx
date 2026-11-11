export function PageHeader({ eyebrow, title, description, action }: { eyebrow?: string; title: string; description?: string; action?: React.ReactNode }) {
  return <div className="flex flex-col gap-4 sm:flex-row sm:items-start sm:justify-between">
    <div className="min-w-0 flex-1">
      {eyebrow && <p className="text-xs font-semibold tracking-wide text-cyan-700">{eyebrow}</p>}
      <h1 className={`${eyebrow ? "mt-1.5 " : ""}break-words text-2xl font-semibold tracking-tight text-[#07152d] sm:text-3xl`}>{title}</h1>
      {description && <p className="mt-2 max-w-3xl text-sm leading-6 text-slate-500">{description}</p>}
    </div>
    {action && <div className="flex flex-wrap items-center gap-2 sm:justify-end">{action}</div>}
  </div>;
}
