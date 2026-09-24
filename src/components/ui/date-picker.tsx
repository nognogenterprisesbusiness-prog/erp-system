"use client";

import { useEffect, useId, useRef, useState } from "react";
import { ArrowLeft01Icon, ArrowRight01Icon, Calendar03Icon } from "@hugeicons/core-free-icons";
import { HugeiconsIcon } from "@hugeicons/react";

const datePattern = /^\d{4}-\d{2}-\d{2}$/;
const monthFormatter = new Intl.DateTimeFormat("en-PH", { month: "long", year: "numeric", timeZone: "UTC" });
const dateFormatter = new Intl.DateTimeFormat("en-PH", { day: "numeric", month: "short", year: "numeric", timeZone: "UTC" });
const weekdays = ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"];

function parseDate(value: string) {
  if (!datePattern.test(value)) return null;
  const date = new Date(`${value}T12:00:00Z`);
  return Number.isNaN(date.getTime()) || date.toISOString().slice(0, 10) !== value ? null : date;
}

export function DatePicker({ id, name, label = "Date", placeholder, value, defaultValue = "", onValueChange, allowClear = true, required = false, popoverAlign = "start", className = "" }: {
  id?: string;
  name?: string;
  label?: string;
  placeholder?: string;
  value?: string;
  defaultValue?: string;
  onValueChange?: (value: string) => void;
  allowClear?: boolean;
  required?: boolean;
  popoverAlign?: "start" | "end";
  className?: string;
}) {
  const [internalValue, setInternalValue] = useState(defaultValue);
  const selected = value ?? internalValue;
  const [month, setMonth] = useState(() => { const initial = parseDate(value ?? defaultValue) ?? new Date(); return new Date(Date.UTC(initial.getUTCFullYear(), initial.getUTCMonth(), 1)); });
  const [open, setOpen] = useState(false);
  const root = useRef<HTMLDivElement>(null);
  const generatedId = useId();
  const selectedDate = parseDate(selected);
  const monthYear = monthFormatter.format(month);
  const firstWeekday = month.getUTCDay();
  const daysInMonth = new Date(Date.UTC(month.getUTCFullYear(), month.getUTCMonth() + 1, 0)).getUTCDate();

  useEffect(() => {
    if (!open) return;
    const dismiss = (event: PointerEvent) => { if (!root.current?.contains(event.target as Node)) setOpen(false); };
    const escape = (event: KeyboardEvent) => { if (event.key === "Escape") setOpen(false); };
    document.addEventListener("pointerdown", dismiss);
    document.addEventListener("keydown", escape);
    return () => { document.removeEventListener("pointerdown", dismiss); document.removeEventListener("keydown", escape); };
  }, [open]);

  const change = (next: string) => {
    if (value === undefined) setInternalValue(next);
    onValueChange?.(next);
    setOpen(false);
  };
  const moveMonth = (offset: number) => setMonth(new Date(Date.UTC(month.getUTCFullYear(), month.getUTCMonth() + offset, 1)));

  return <div ref={root} className={`relative min-w-0 ${className}`}>
    <button type="button" id={id ?? generatedId} aria-label={label} aria-haspopup="dialog" aria-expanded={open} onClick={() => setOpen((current) => !current)} className="flex h-10 w-full items-center justify-between gap-2 rounded-xl border border-slate-200 bg-white px-3 text-left text-sm text-slate-700 hover:border-cyan-500 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-cyan-600">
      <span className={`min-w-0 truncate whitespace-nowrap ${selectedDate ? "" : "text-slate-500"}`}>{selectedDate ? dateFormatter.format(selectedDate) : placeholder ?? `Choose ${label.toLowerCase()}`}</span>
      <HugeiconsIcon icon={Calendar03Icon} size={17} className="shrink-0 text-slate-500" />
    </button>
    {name && <input type="hidden" name={name} value={selected} required={required} />}
    {open && <div role="dialog" aria-label={`${label} calendar`} className={`absolute z-50 mt-2 w-[min(19rem,calc(100vw-2rem))] rounded-2xl border border-slate-200 bg-white p-3 text-slate-800 shadow-xl ${popoverAlign === "end" ? "right-0" : "left-0"}`}>
      <div className="flex items-center justify-between gap-2 px-1 pb-3"><button type="button" onClick={() => moveMonth(-1)} aria-label="Previous month" className="grid size-8 place-items-center rounded-lg hover:bg-slate-100"><HugeiconsIcon icon={ArrowLeft01Icon} size={17} /></button><span className="text-sm font-semibold">{monthYear}</span><button type="button" onClick={() => moveMonth(1)} aria-label="Next month" className="grid size-8 place-items-center rounded-lg hover:bg-slate-100"><HugeiconsIcon icon={ArrowRight01Icon} size={17} /></button></div>
      <div className="grid grid-cols-7 gap-1 text-center">{weekdays.map((day) => <span key={day} className="py-1 text-xs font-medium text-slate-500">{day}</span>)}{Array.from({ length: firstWeekday }, (_, index) => <span key={`blank-${index}`} />)}{Array.from({ length: daysInMonth }, (_, index) => { const day = index + 1; const iso = new Date(Date.UTC(month.getUTCFullYear(), month.getUTCMonth(), day)).toISOString().slice(0, 10); return <button key={iso} type="button" aria-label={dateFormatter.format(new Date(`${iso}T12:00:00Z`))} aria-pressed={selected === iso} onClick={() => change(iso)} className={`grid size-9 place-items-center rounded-full text-sm hover:bg-cyan-50 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-cyan-600 ${selected === iso ? "bg-cyan-700 font-semibold text-white hover:bg-cyan-700" : ""}`}>{day}</button>; })}</div>
      {allowClear && selected && <div className="mt-3 flex justify-end border-t border-slate-100 pt-2"><button type="button" onClick={() => change("")} className="rounded-lg px-2 py-1 text-xs font-medium text-cyan-700 hover:bg-cyan-50">Clear date</button></div>}
    </div>}
  </div>;
}
