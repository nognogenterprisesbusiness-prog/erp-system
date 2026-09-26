"use client";

import { useEffect, useId, useRef, useState } from "react";
import { Location01Icon, Search01Icon } from "@hugeicons/core-free-icons";
import { HugeiconsIcon } from "@hugeicons/react";
import { EmptyState } from "@/components/ui/empty-state";

type Option = { code: string; displayName: string; province: string; region: string; zipCode: string };

export function LocationPicker({ name = "municipalityCode", displayNameName, label = "City / municipality", initialCode = "", initialLabel = "" }: {
  name?: string;
  displayNameName?: string;
  label?: string;
  initialCode?: string;
  initialLabel?: string;
}) {
  const [code, setCode] = useState(initialCode);
  const [query, setQuery] = useState(initialLabel);
  const [options, setOptions] = useState<Option[]>([]);
  const [open, setOpen] = useState(false);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");
  const [activeIndex, setActiveIndex] = useState(0);
  const root = useRef<HTMLDivElement>(null);
  const listId = useId();

  useEffect(() => {
    if (!open) return;
    const controller = new AbortController();
    const timer = window.setTimeout(async () => {
      setLoading(true); setError("");
      try {
        const params = new URLSearchParams({ kind: "municipalities", q: query, limit: "20" });
        const response = await fetch(`/api/locations?${params}`, { signal: controller.signal });
        if (!response.ok) throw new Error("Location search is unavailable.");
        const result = await response.json() as { items: Option[] };
        setOptions(result.items);
        setActiveIndex(0);
      } catch (cause) {
        if (!controller.signal.aborted) setError(cause instanceof Error ? cause.message : "Location search is unavailable.");
      } finally { if (!controller.signal.aborted) setLoading(false); }
    }, 150);
    return () => { controller.abort(); window.clearTimeout(timer); };
  }, [query, open]);

  useEffect(() => {
    if (!open) return;
    const close = (event: PointerEvent) => { if (!root.current?.contains(event.target as Node)) setOpen(false); };
    document.addEventListener("pointerdown", close);
    return () => document.removeEventListener("pointerdown", close);
  }, [open]);

  const selectOption = (option: Option) => {
    setCode(option.code);
    setQuery(option.displayName);
    setOpen(false);
  };

  const handleKeyDown = (event: React.KeyboardEvent<HTMLInputElement>) => {
    if (event.key === "Escape" && open) { event.preventDefault(); event.stopPropagation(); setOpen(false); return; }
    if (event.key === "ArrowDown" || event.key === "ArrowUp") {
      event.preventDefault();
      setOpen(true);
      setActiveIndex((current) => options.length === 0 ? 0 : (current + (event.key === "ArrowDown" ? 1 : -1) + options.length) % options.length);
    }
    if (event.key === "Enter" && open) {
      event.preventDefault();
      if (options[activeIndex]) selectOption(options[activeIndex]);
    }
  };

  return <div ref={root} className="relative min-w-0">
    <label htmlFor={`${listId}-input`} className="mb-2 block text-sm font-medium leading-5 text-slate-700">{label}</label>
    <div className="relative">
      <HugeiconsIcon icon={Search01Icon} size={17} className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-slate-400" />
      <input id={`${listId}-input`} type="search" value={query} onFocus={() => setOpen(true)} onChange={(event) => { setQuery(event.target.value); setCode(""); setOptions([]); setActiveIndex(0); setOpen(true); }} onKeyDown={handleKeyDown} role="combobox" aria-expanded={open} aria-controls={open ? listId : undefined} aria-activedescendant={open && options[activeIndex] ? `${listId}-option-${activeIndex}` : undefined} aria-autocomplete="list" autoComplete="off" placeholder="Search any city or municipality" className="h-11 w-full rounded-lg border border-slate-200 bg-white pl-10 pr-4 text-sm outline-none focus:border-cyan-600 focus:ring-4 focus:ring-cyan-600/10" />
    </div>
    <input type="hidden" name={name} value={code} />
    {displayNameName && <input type="hidden" name={displayNameName} value={query} />}
    {open && <div id={listId} role="listbox" aria-label={label} className="absolute z-50 mt-1 max-h-64 w-full overflow-auto rounded-xl border border-slate-200 bg-white p-1 shadow-xl">
      {loading ? <p className="px-3 py-3 text-xs text-slate-500">Searching locations…</p> : error ? <p role="alert" className="px-3 py-3 text-xs text-red-700">{error}</p> : options.length === 0 ? <EmptyState kind={query.trim() ? "results" : "data"} compact title={query.trim() ? "No matching city or municipality" : "Search for a city or municipality"} /> : options.map((option, index) => <button key={option.code} id={`${listId}-option-${index}`} type="button" role="option" aria-selected={activeIndex === index} onMouseEnter={() => setActiveIndex(index)} onClick={() => selectOption(option)} className={`flex w-full items-start gap-2 rounded-lg px-3 py-2 text-left text-sm hover:bg-cyan-50 focus-visible:bg-cyan-50 focus-visible:outline-none ${activeIndex === index ? "bg-cyan-50" : ""}`}><HugeiconsIcon icon={Location01Icon} size={16} className="mt-0.5 shrink-0 text-cyan-700" /><span><span className="block font-medium text-slate-800">{option.displayName}</span><span className="text-xs text-slate-500">{option.province} · {option.region}{option.zipCode ? ` · ${option.zipCode}` : ""}</span></span></button>)}
    </div>}
  </div>;
}
