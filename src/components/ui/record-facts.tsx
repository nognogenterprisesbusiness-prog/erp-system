import type { ReactNode } from "react";
import { cn } from "@/lib/utils";

export type RecordFact = { label: string; value: ReactNode };

export function RecordFacts({ items, className }: { items: readonly RecordFact[]; className?: string }) {
  return <dl className={cn("grid min-w-0 gap-x-6 gap-y-3 sm:grid-cols-2 lg:grid-cols-3", className)}>{items.map(item => <div key={item.label} className="min-w-0"><dt className="text-sm leading-5 text-slate-600">{item.label}</dt><dd className="mt-0.5 break-words text-sm font-medium leading-6 text-slate-800">{item.value}</dd></div>)}</dl>;
}
