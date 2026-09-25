"use client";

import { useState } from "react";

function formatAmount(value: string) {
  const cleaned = value.replace(/[^0-9.]/g, "");
  const dot = cleaned.indexOf(".");
  const whole = (dot < 0 ? cleaned : cleaned.slice(0, dot)).slice(0, 11);
  const grouped = whole.replace(/\B(?=(\d{3})+(?!\d))/g, ",");
  return dot < 0 ? grouped : `${grouped}.${cleaned.slice(dot + 1).replaceAll(".", "").slice(0, 2)}`;
}

export function PesoAmountInput({ name, label, defaultValue = "", placeholder = "0.00", required = false, submitUngrouped = false }: {
  name: string;
  label: string;
  defaultValue?: string;
  placeholder?: string;
  required?: boolean;
  submitUngrouped?: boolean;
}) {
  const [display, setDisplay] = useState(() => formatAmount(defaultValue));
  return <label className="grid gap-1.5 text-xs font-semibold">{label}
    <span className="relative block">
      <span aria-hidden="true" className="absolute left-3 top-1/2 -translate-y-1/2 text-sm font-medium text-slate-500">₱</span>
      <input name={submitUngrouped ? undefined : name} aria-label={label} value={display} onChange={(event) => setDisplay(formatAmount(event.target.value))} inputMode="decimal" autoComplete="off" required={required} placeholder={placeholder} className="h-10 w-full rounded-lg border border-slate-200 bg-white pl-8 pr-3 text-sm tabular-nums outline-none focus-visible:ring-2 focus-visible:ring-cyan-600" />
      {submitUngrouped && <input type="hidden" name={name} value={display.replaceAll(",", "")} />}
    </span>
  </label>;
}
