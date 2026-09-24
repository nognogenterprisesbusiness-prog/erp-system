export function PageHeader({ eyebrow, title, description, action }: { eyebrow?: string; title: string; description?: string; action?: React.ReactNode }) {
  return <div className="flex flex-col gap-4 sm:flex-row sm:items-end sm:justify-between"><div>{eyebrow && <p className="text-xs font-semibold uppercase tracking-[0.18em] text-cyan-700">{eyebrow}</p>}<h1 className={`${eyebrow ? "mt-1.5 " : ""}text-3xl font-semibold tracking-[-0.035em] text-[#07152d]`}>{title}</h1>{description && <p className="mt-1 max-w-2xl text-sm text-slate-500">{description}</p>}</div>{action}</div>;
}
