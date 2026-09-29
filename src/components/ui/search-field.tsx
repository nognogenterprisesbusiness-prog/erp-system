import type { InputHTMLAttributes } from "react";
import { Search01Icon } from "@hugeicons/core-free-icons";
import { HugeiconsIcon } from "@hugeicons/react";

import { cn } from "@/lib/utils";

export function SearchField({ label, className, wrapperClassName, ...props }: InputHTMLAttributes<HTMLInputElement> & { label: string; wrapperClassName?: string }) {
  return <label className={cn("relative block w-full min-w-0 sm:w-80 sm:max-w-sm", wrapperClassName)}>
    <span className="sr-only">{label}</span>
    <HugeiconsIcon icon={Search01Icon} size={17} className="pointer-events-none absolute left-4 top-1/2 -translate-y-1/2 text-slate-400" />
    <input {...props} type="search" enterKeyHint="search" aria-label={label} className={cn("h-10 w-full rounded-full border border-slate-200 bg-slate-50 pl-11 pr-4 text-sm text-slate-800 outline-none transition-colors placeholder:text-slate-400 focus:border-cyan-600 focus:bg-white focus:ring-2 focus:ring-cyan-600/10", className)} />
  </label>;
}
