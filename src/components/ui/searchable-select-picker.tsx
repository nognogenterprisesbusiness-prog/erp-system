"use client";

import { useContext, useEffect, useId, useMemo, useRef, useState } from "react";
import { createPortal } from "react-dom";
import { searchSelectOptions } from "@/lib/ui/select-search";
import { cn } from "@/lib/utils";
import { FilterBarContext } from "./filter-bar-context";
import type { SelectPickerProps } from "./select-picker";

export function SearchableSelectPicker({ id, options, label, name, value, defaultValue, onValueChange, placeholder, disabled, required, className, "aria-describedby": describedBy, "aria-invalid": invalid, "aria-required": ariaRequired }: SelectPickerProps) {
  const generatedId = useId();
  const listId = `${generatedId}-options`;
  const input = useRef<HTMLInputElement>(null);
  const formSelection = useRef<HTMLSelectElement>(null);
  const root = useRef<HTMLDivElement>(null);
  const popup = useRef<HTMLDivElement>(null);
  const [localValue, setLocalValue] = useState(defaultValue ?? "");
  const [query, setQuery] = useState("");
  const [open, setOpen] = useState(false);
  const [active, setActive] = useState(0);
  const [validation, setValidation] = useState(false);
  const [position, setPosition] = useState<{ top: number; left: number; width: number; height: number; container: HTMLElement }>();
  const filterChange = useContext(FilterBarContext);
  const selection = value ?? localValue;
  const selected = options.find(option => option.value === selection);
  const { visible, count } = useMemo(() => searchSelectOptions(options, query), [options, query]);
  const locked = disabled || options.length === 0;
  useEffect(() => {
    if (!open) return;
    const place = () => {
      const rect = input.current?.getBoundingClientRect();
      if (!rect) return;
      const below = window.innerHeight - rect.bottom - 12;
      const height = Math.min(300, Math.max(below, rect.top - 12));
      setPosition({ top: below >= Math.min(220, height) ? rect.bottom + 5 : Math.max(8, rect.top - height - 5), left: Math.max(8, Math.min(rect.left, window.innerWidth - rect.width - 8)), width: Math.min(rect.width, window.innerWidth - 16), height, container: input.current?.closest("dialog") ?? document.body });
    };
    const outside = (event: PointerEvent) => { if (!root.current?.contains(event.target as Node) && !popup.current?.contains(event.target as Node)) { setOpen(false); setQuery(""); } };
    place();
    window.addEventListener("resize", place);
    window.addEventListener("scroll", place, true);
    document.addEventListener("pointerdown", outside);
    return () => { window.removeEventListener("resize", place); window.removeEventListener("scroll", place, true); document.removeEventListener("pointerdown", outside); };
  }, [open]);
  useEffect(() => { if (open) popup.current?.querySelector('[data-active="true"]')?.scrollIntoView({ block: "nearest" }); }, [active, query, open]);
  function choose(index: number) {
    const option = visible[index];
    if (!option || option.disabled || locked) return;
    if (option.value !== selection) formSelection.current?.dispatchEvent(new Event("input", { bubbles: true }));
    setLocalValue(option.value); setValidation(false); setOpen(false); setQuery("");
    onValueChange?.(option.value);
    if (name) filterChange?.(name, option.value);
  }
  return <div ref={root} data-searchable-select className={cn("relative min-w-0 w-full", className)}>
    <div className="relative">
      <input data-select-search-input ref={input} id={id} role="combobox" aria-label={label} aria-expanded={open} aria-controls={open ? listId : undefined} aria-autocomplete="list" aria-activedescendant={open && visible[active] ? `${listId}-${active}` : undefined} aria-describedby={describedBy} aria-invalid={invalid || validation || undefined} aria-required={ariaRequired ?? required} type="text" autoComplete="off" disabled={locked} value={open ? query : selected?.label ?? ""} placeholder={open ? `Search ${label.toLowerCase()}…` : placeholder ?? `Choose ${label.toLowerCase()}`} onFocus={() => { setActive(0); setOpen(true); }} onClick={() => setOpen(true)} onChange={event => { setQuery(event.target.value); setActive(0); setOpen(true); }} onBlur={event => { if (!popup.current?.contains(event.relatedTarget)) { setOpen(false); setQuery(""); } }} onKeyDown={event => {
        if (event.key === "Escape" && open) { event.preventDefault(); event.stopPropagation(); setOpen(false); setQuery(""); return; }
        if (event.key === "Tab") { setOpen(false); setQuery(""); return; }
        if (event.key === "ArrowDown" || event.key === "ArrowUp") {
          event.preventDefault(); setOpen(true);
          const enabled = visible.map((option, index) => option.disabled ? -1 : index).filter(index => index >= 0);
          const at = enabled.indexOf(active);
          setActive(enabled[(at + (event.key === "ArrowDown" ? 1 : -1) + enabled.length) % enabled.length] ?? 0);
        }
        if (event.key === "Enter" && open) { event.preventDefault(); choose(active); }
      }} className="min-h-11 w-full rounded-lg border border-slate-200 bg-white py-2.5 pl-3 pr-10 text-sm text-slate-800 outline-none focus-visible:border-cyan-600 focus-visible:ring-2 focus-visible:ring-cyan-600/20 disabled:opacity-50" />
      <button type="button" tabIndex={-1} disabled={locked} aria-label={`Choose ${label.toLowerCase()}`} onMouseDown={event => event.preventDefault()} onClick={() => { if (!open) input.current?.focus(); setQuery(""); setOpen(!open); }} className="absolute inset-y-0 right-0 grid w-10 place-items-center text-slate-500"><span aria-hidden>⌄</span></button>
    </div>
    <select ref={formSelection} name={name} value={selected?.value ?? ""} onChange={() => {}} required={required} disabled={locked} tabIndex={-1} aria-hidden="true" className="sr-only" onInvalid={event => { event.preventDefault(); setValidation(true); input.current?.focus(); }}><option value="" />{selected && <option value={selected.value}>{selected.label}</option>}</select>
    {validation && <p role="alert" className="mt-1 text-xs text-red-700">Choose {label.toLowerCase()} from the list.</p>}
    {open && position && createPortal(<div ref={popup} style={{ position: "fixed", top: position.top, left: position.left, width: position.width, maxHeight: position.height }} className="z-[100] flex flex-col overflow-hidden rounded-lg border border-slate-200 bg-white p-1 text-slate-800 shadow-xl">
      <div id={listId} role="listbox" aria-label={label} className="min-h-0 overflow-y-auto overscroll-contain">
        {visible.length ? visible.map((option, index) => <button id={`${listId}-${index}`} key={option.value} type="button" role="option" tabIndex={-1} aria-selected={option.value === selection} disabled={option.disabled} data-active={index === active} onMouseDown={event => event.preventDefault()} onMouseEnter={() => setActive(index)} onClick={() => choose(index)} className={cn("block min-h-9 w-full rounded-md px-3 py-2 text-left text-sm disabled:opacity-50", index === active && "bg-cyan-50 text-cyan-900", option.value === selection && "font-semibold")}><span className="block whitespace-normal break-words">{option.label}</span></button>) : <p className="px-3 py-4 text-sm text-slate-500">No matches. Try another name.</p>}
      </div>
      {count > 50 && <p className="border-t border-slate-100 px-3 py-2 text-xs text-slate-500">Showing 50 of {count.toLocaleString()}. Type to narrow the list.</p>}
    </div>, position.container)}
  </div>;
}
