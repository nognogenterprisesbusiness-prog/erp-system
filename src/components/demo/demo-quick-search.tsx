"use client";

import { useEffect, useId, useMemo, useRef, useState } from "react";
import { Search01Icon } from "@hugeicons/core-free-icons";
import { HugeiconsIcon } from "@hugeicons/react";

import { HistoryLink } from "@/components/layout/history-link";
import { EmptyState } from "@/components/ui/empty-state";
import { demoQuickShortcuts, searchDemo } from "@/lib/demo/search";
import type { DemoData, DemoRole } from "@/lib/demo/schema";

export function DemoQuickSearch({ tables, role, userId, initialQuery = "" }: { tables?: DemoData; role: DemoRole; userId?: string; initialQuery?: string }) {
  const [query, setQuery] = useState(initialQuery);
  const [open, setOpen] = useState(Boolean(initialQuery));
  const [active, setActive] = useState(0);
  const root = useRef<HTMLDivElement>(null);
  const input = useRef<HTMLInputElement>(null);
  const listId = useId();
  const results = useMemo(() => tables && query.trim() ? searchDemo(tables, role, query, userId).slice(0, 8) : demoQuickShortcuts(role, tables, userId), [tables, role, userId, query]);

  useEffect(() => {
    const onOutside = (event: PointerEvent) => { if (root.current && !root.current.contains(event.target as Node)) setOpen(false); };
    const onShortcut = (event: KeyboardEvent) => {
      if ((event.ctrlKey || event.metaKey) && event.key.toLowerCase() === "k") {
        event.preventDefault();
        input.current?.focus();
        setOpen(true);
      }
    };
    document.addEventListener("pointerdown", onOutside);
    document.addEventListener("keydown", onShortcut);
    return () => { document.removeEventListener("pointerdown", onOutside); document.removeEventListener("keydown", onShortcut); };
  }, []);

  function navigate(href: string) {
    setOpen(false);
    setQuery("");
    setActive(0);
    input.current?.blur();
    if (`${window.location.pathname}${window.location.search}` !== href) window.history.pushState(null, "", href);
  }

  return <div ref={root} role="search" className="relative max-w-[320px]">
    <div className="relative">
      <HugeiconsIcon icon={Search01Icon} size={18} className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-slate-400" />
      <input ref={input} type="search" value={query} maxLength={80} autoComplete="off" aria-label="Quick search demo shortcuts" role="combobox" aria-autocomplete="list" aria-expanded={open} aria-controls={open ? listId : undefined} aria-activedescendant={open && results[active] ? `${listId}-${active}` : undefined} placeholder="Search…" onFocus={() => setOpen(true)} onChange={(event) => { setQuery(event.target.value); setOpen(true); setActive(0); }} onKeyDown={(event) => {
        if (event.key === "Escape") { setOpen(false); input.current?.blur(); return; }
        if (event.key === "Tab") { setOpen(false); return; }
        if (event.key === "ArrowDown") { event.preventDefault(); setOpen(true); setActive((value) => Math.min(value + 1, results.length - 1)); return; }
        if (event.key === "ArrowUp") { event.preventDefault(); setOpen(true); setActive((value) => Math.max(value - 1, 0)); return; }
        if (event.key === "Enter" && open) { event.preventDefault(); if (results[active]) navigate(results[active].href); }
      }} className="h-9 w-full rounded-full border border-slate-200 bg-slate-50 pl-10 pr-4 text-sm text-slate-800 outline-none transition-colors placeholder:text-slate-400 focus:border-cyan-600 focus:bg-white focus:ring-2 focus:ring-cyan-600/10" />
    </div>
    {open ? <div className="absolute left-0 top-full z-[60] mt-2 w-full overflow-hidden rounded-xl border border-slate-200 bg-white shadow-2xl max-sm:fixed max-sm:left-4 max-sm:right-4 max-sm:top-[108px] max-sm:mt-0 max-sm:w-auto">
      <div className="border-b border-slate-100 px-3 py-2"><p className="text-[11px] font-semibold uppercase tracking-[0.12em] text-slate-500">{query.trim() ? "Quick results" : "Shortcuts"}</p></div>
      <div id={listId} role="listbox" aria-label="Demo search suggestions" className="max-h-[min(24rem,60vh)] overflow-y-auto p-1.5">
        {results.length ? results.map((item, index) => <HistoryLink key={item.id} id={`${listId}-${index}`} role="option" aria-selected={active === index} href={item.href} onMouseEnter={() => setActive(index)} onClick={(event) => { if (!event.defaultPrevented) { setOpen(false); setQuery(""); setActive(0); } }} className={`flex items-start gap-3 rounded-lg px-3 py-2.5 outline-none ${active === index ? "bg-cyan-50" : "hover:bg-slate-50"}`}><span className="mt-0.5 w-12 shrink-0 text-[10px] font-semibold uppercase tracking-wide text-cyan-700">{item.type}</span><span className="min-w-0"><span className="block truncate text-sm font-semibold text-slate-800">{item.title}</span><span className="block truncate text-xs text-slate-500">{item.detail}</span></span></HistoryLink>) : <EmptyState kind="results" compact title="No matching shortcuts or records" />}
      </div>
    </div> : null}
  </div>;
}
