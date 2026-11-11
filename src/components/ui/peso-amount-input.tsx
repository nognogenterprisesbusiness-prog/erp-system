"use client";

import { useId } from "react";
import { MoneyInput } from "./money-input";

export function PesoAmountInput({ name, label, defaultValue = "", placeholder = "1,500.00", required = false }: {
  name: string;
  label: string;
  defaultValue?: string;
  placeholder?: string;
  required?: boolean;
}) {
  const id = useId();
  return <label htmlFor={id} className="grid min-w-0 content-start gap-2 text-sm font-medium leading-5 text-slate-700"><span>{label}</span>
    <span className="relative block">
      <span aria-hidden="true" className="absolute left-3 top-1/2 -translate-y-1/2 text-sm font-medium text-slate-500">₱</span>
      <MoneyInput id={id} name={name} defaultValue={defaultValue} autoComplete="off" required={required} placeholder={placeholder} className="h-11 w-full rounded-lg border border-slate-200 bg-white pl-8 pr-3 text-sm tabular-nums outline-none focus-visible:ring-2 focus-visible:ring-cyan-600" />
    </span>
  </label>;
}
