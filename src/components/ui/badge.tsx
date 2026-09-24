import type { HTMLAttributes } from "react";

import { cn } from "@/lib/utils";

const styles = {
  active: "bg-emerald-50 text-emerald-700 ring-emerald-600/15",
  review: "bg-amber-50 text-amber-700 ring-amber-600/15",
  info: "bg-sky-50 text-sky-700 ring-sky-600/15",
  neutral: "bg-slate-100 text-slate-600 ring-slate-500/10",
};

export function Badge({ className, children, variant = "neutral", ...props }: HTMLAttributes<HTMLSpanElement> & { variant?: keyof typeof styles }) {
  return <span className={cn("inline-flex items-center rounded-full px-2.5 py-1 text-[11px] font-semibold ring-1 ring-inset", styles[variant], className)} {...props}>{children}</span>;
}
