import { cn } from "@/lib/utils";

export const fieldControlClass = "h-11 w-full rounded-lg border border-slate-200 bg-white px-3 text-sm text-slate-900 outline-none transition placeholder:text-slate-400 focus:border-cyan-600 focus:ring-4 focus:ring-cyan-600/10 disabled:bg-slate-50 disabled:text-slate-400";

export function FormField({ label, htmlFor, hint, error, className, children }: { label: string; htmlFor: string; hint?: string; error?: string; className?: string; children: React.ReactNode }) {
  return <label htmlFor={htmlFor} className={cn("block space-y-2 text-sm font-medium text-slate-700", className)}><span>{label}</span>{children}{hint && !error && <span className="block text-xs font-normal text-slate-400">{hint}</span>}{error && <span className="block text-xs font-medium text-red-600">{error}</span>}</label>;
}
