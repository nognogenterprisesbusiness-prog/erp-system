import { cn } from "@/lib/utils";
import { getFieldGuide } from "./field-guide";

export const fieldControlClass = "h-11 w-full rounded-lg border border-slate-200 bg-white px-3 text-sm text-slate-900 outline-none transition placeholder:text-slate-400 focus:border-cyan-600 focus:ring-4 focus:ring-cyan-600/10 disabled:bg-slate-50 disabled:text-slate-400";

export function FormField({ label, htmlFor, hint, error, className, children }: { label: string; htmlFor: string; hint?: string; error?: string; className?: string; children: React.ReactNode }) {
  const guide = hint ?? getFieldGuide(label, { name: htmlFor });
  return <label htmlFor={htmlFor} className={cn("grid min-w-0 content-start gap-2 text-sm font-medium text-slate-700", className)}><span>{label}</span>{children}{guide && !error && <span className="block text-xs font-normal leading-5 text-slate-500">{guide}</span>}{error && <span role="alert" className="block text-xs font-medium text-red-600">{error}</span>}</label>;
}
