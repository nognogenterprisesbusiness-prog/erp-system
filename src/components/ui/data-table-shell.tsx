export function DataTableShell({ children, empty, footer }: { children: React.ReactNode; empty?: React.ReactNode; footer?: React.ReactNode }) {
  return <section className="mt-5 overflow-hidden rounded-xl border border-slate-200 bg-white shadow-[0_1px_2px_rgba(15,23,42,0.03)]">{empty ?? <div className="overflow-x-auto">{children}</div>}{footer && <div className="border-t border-slate-100 px-5 py-3">{footer}</div>}</section>;
}
