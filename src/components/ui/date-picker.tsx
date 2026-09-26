"use client";

import { useContext, useEffect, useId, useLayoutEffect, useRef, useState } from "react";
import { FilterBarContext } from "./filter-bar-context";
import { createPortal } from "react-dom";
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

export function DatePicker({ id, name, label = "Date", placeholder, value, defaultValue = "", onValueChange, allowClear = true, required = false, minDate, maxDate, popoverAlign = "start", className = "" }: {
  id?: string;
  name?: string;
  label?: string;
  placeholder?: string;
  value?: string;
  defaultValue?: string;
  onValueChange?: (value: string) => void;
  allowClear?: boolean;
  required?: boolean;
  minDate?: string;
  maxDate?: string;
  popoverAlign?: "start" | "end";
  className?: string;
}) {
  const [internalValue, setInternalValue] = useState(defaultValue);
  const selected = value ?? internalValue;
  const [month, setMonth] = useState(() => { const initial = parseDate(value ?? defaultValue) ?? new Date(); return new Date(Date.UTC(initial.getUTCFullYear(), initial.getUTCMonth(), 1)); });
  const [open, setOpen] = useState(false);
  const [portalContainer, setPortalContainer] = useState<HTMLElement | null>(null);
  const root = useRef<HTMLDivElement>(null);
  const calendar = useRef<HTMLDivElement>(null);
  const [position, setPosition] = useState({ left: 16, top: 16, width: 304 });
  const generatedId = useId();
  const selectedDate = parseDate(selected);
  const monthYear = monthFormatter.format(month);
  const firstWeekday = month.getUTCDay();
  const daysInMonth = new Date(Date.UTC(month.getUTCFullYear(), month.getUTCMonth() + 1, 0)).getUTCDate();

  useEffect(() => {
    if (!open) return;
    const dismiss = (event: PointerEvent) => { if (!root.current?.contains(event.target as Node) && !calendar.current?.contains(event.target as Node)) setOpen(false); };
    const escape = (event: KeyboardEvent) => { if (event.key === "Escape") { event.preventDefault(); event.stopPropagation(); setOpen(false); } };
    document.addEventListener("pointerdown", dismiss);
    document.addEventListener("keydown", escape, true);
    return () => { document.removeEventListener("pointerdown", dismiss); document.removeEventListener("keydown", escape, true); };
  }, [open]);

  useLayoutEffect(() => {
    if (!open) return;
    const place = () => {
      const anchor = root.current?.getBoundingClientRect();
      if (!anchor) return;
      const width = Math.min(304, window.innerWidth - 32);
      const height = calendar.current?.offsetHeight ?? 360;
      const desiredLeft = popoverAlign === "end" ? anchor.right - width : anchor.left;
      const left = Math.max(16, Math.min(desiredLeft, window.innerWidth - width - 16));
      const below = window.innerHeight - anchor.bottom - 8;
      const above = anchor.top - 8;
      const top = below < Math.min(height, 320) && above > below
        ? Math.max(16, anchor.top - height - 8)
        : Math.max(16, Math.min(anchor.bottom + 8, window.innerHeight - height - 16));
      setPosition((current) => current.left === left && current.top === top && current.width === width ? current : { left, top, width });
    };
    place();
    window.addEventListener("resize", place);
    document.addEventListener("scroll", place, true);
    return () => { window.removeEventListener("resize", place); document.removeEventListener("scroll", place, true); };
  }, [open, month, popoverAlign]);

  const filterChange = useContext(FilterBarContext);
  const change = (next: string) => {
    if (value === undefined) setInternalValue(next);
    onValueChange?.(next);
    if (name) filterChange?.(name, next);
    setOpen(false);
  };
  const moveMonth = (offset: number) => setMonth(new Date(Date.UTC(month.getUTCFullYear(), month.getUTCMonth() + offset, 1)));
  const previousMonthEnd = new Date(Date.UTC(month.getUTCFullYear(), month.getUTCMonth(), 0)).toISOString().slice(0, 10);
  const nextMonthStart = new Date(Date.UTC(month.getUTCFullYear(), month.getUTCMonth() + 1, 1)).toISOString().slice(0, 10);

  return <div ref={root} className={`relative min-w-0 ${className}`}>
    <button type="button" id={id ?? generatedId} aria-label={label} aria-haspopup="dialog" aria-expanded={open} onClick={() => { setPortalContainer(root.current?.closest("dialog") ?? document.body); setOpen((current) => !current); }} className="flex h-10 w-full items-center justify-between gap-2 rounded-xl border border-slate-200 bg-white px-3 text-left text-sm text-slate-700 hover:border-cyan-500 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-cyan-600">
      <span className={`min-w-0 truncate whitespace-nowrap ${selectedDate ? "" : "text-slate-500"}`}>{selectedDate ? dateFormatter.format(selectedDate) : placeholder ?? `Choose ${label.toLowerCase()}`}</span>
      <HugeiconsIcon icon={Calendar03Icon} size={17} className="shrink-0 text-slate-500" />
    </button>
    {name && <input type="hidden" name={name} value={selected} required={required} />}
    {open && portalContainer && createPortal(<div ref={calendar} role="dialog" aria-label={`${label} calendar`} style={{ left: position.left, top: position.top, width: position.width, maxHeight: "min(24rem, calc(100vh - 2rem))" }} className="fixed z-[100] overflow-y-auto rounded-2xl border border-slate-200 bg-white p-3 text-slate-800 shadow-xl">
      <div className="flex items-center justify-between gap-2 px-1 pb-3"><button type="button" onClick={() => moveMonth(-1)} disabled={Boolean(minDate && previousMonthEnd < minDate)} aria-label="Previous month" className="grid size-8 place-items-center rounded-lg hover:bg-slate-100 disabled:cursor-not-allowed disabled:opacity-40"><HugeiconsIcon icon={ArrowLeft01Icon} size={17} /></button><span className="text-sm font-semibold">{monthYear}</span><button type="button" onClick={() => moveMonth(1)} disabled={Boolean(maxDate && nextMonthStart > maxDate)} aria-label="Next month" className="grid size-8 place-items-center rounded-lg hover:bg-slate-100 disabled:cursor-not-allowed disabled:opacity-40"><HugeiconsIcon icon={ArrowRight01Icon} size={17} /></button></div>
      <div className="grid grid-cols-7 gap-1 text-center">{weekdays.map((day) => <span key={day} className="py-1 text-xs font-medium text-slate-500">{day}</span>)}{Array.from({ length: firstWeekday }, (_, index) => <span key={`blank-${index}`} />)}{Array.from({ length: daysInMonth }, (_, index) => { const day = index + 1; const iso = new Date(Date.UTC(month.getUTCFullYear(), month.getUTCMonth(), day)).toISOString().slice(0, 10); const outsideRange = Boolean((minDate && iso < minDate) || (maxDate && iso > maxDate)); return <button key={iso} type="button" disabled={outsideRange} aria-label={dateFormatter.format(new Date(`${iso}T12:00:00Z`))} aria-pressed={selected === iso} onClick={() => change(iso)} className={`grid size-9 place-items-center rounded-full text-sm hover:bg-cyan-50 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-cyan-600 disabled:cursor-not-allowed disabled:text-slate-300 disabled:hover:bg-transparent ${selected === iso ? "bg-cyan-700 font-semibold text-white hover:bg-cyan-700" : ""}`}>{day}</button>; })}</div>
      {allowClear && selected && <div className="mt-3 flex justify-end border-t border-slate-100 pt-2"><button type="button" onClick={() => change("")} className="rounded-lg px-2 py-1 text-xs font-medium text-cyan-700 hover:bg-cyan-50">Clear date</button></div>}
    </div>, portalContainer)}
  </div>;
}
