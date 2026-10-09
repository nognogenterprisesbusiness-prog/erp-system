import * as React from "react";

import { cn } from "@/lib/utils";

export function Input({ className, type, ...props }: React.ComponentProps<"input">) {
  return <input type={type} className={cn("flex h-11 w-full rounded-lg border border-slate-200 bg-white px-3.5 text-sm text-slate-900 shadow-xs outline-none transition placeholder:text-slate-400 hover:border-slate-300 focus:border-cyan-600 focus:ring-4 focus:ring-cyan-600/10 disabled:cursor-not-allowed disabled:opacity-50", className)} {...props} />;
}
