import { Search01Icon } from "@hugeicons/core-free-icons";
import { HugeiconsIcon } from "@hugeicons/react";

export function HeaderSearch({ initialQuery = "" }: { initialQuery?: string }) {
  return <form action="/projects" method="get" role="search" className="relative max-w-sm">
    <HugeiconsIcon icon={Search01Icon} size={18} className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-slate-400" />
    <input name="q" type="search" defaultValue={initialQuery} maxLength={80} aria-label="Search projects" placeholder="Search projects" className="h-9 w-full rounded-full border border-slate-200 bg-slate-50 pl-10 pr-4 text-sm text-slate-800 outline-none transition-colors placeholder:text-slate-400 focus:border-cyan-600 focus:bg-white focus:ring-2 focus:ring-cyan-600/10" />
  </form>;
}
