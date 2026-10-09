"use client";

import { useId, useRef, useState } from "react";
import { usePathname, useSearchParams } from "next/navigation";
import { IntentLink as Link } from "@/components/layout/intent-link";
import { manualGroups, searchManualTopics, type ManualTopic } from "@/lib/help/navigation";

export function ManualNavigation({ topics, mobile = false }: { topics: ManualTopic[]; mobile?: boolean }) {
  const pathname = usePathname();
  const params = useSearchParams();
  const [query, setQuery] = useState(() => (params.get("q") ?? "").slice(0, 100));
  const inputId = useId();
  const disclosure = useRef<HTMLDetailsElement>(null);
  const matching = searchManualTopics(topics, query);
  const searching = query.trim().length > 0;
  const navigation = <>
    <div className="sticky top-0 z-10 bg-white pb-4 pt-1">
      <label htmlFor={inputId} className="sr-only">Search the manual</label>
      <input id={inputId} type="search" value={query} maxLength={100} placeholder="Search the manual…" autoComplete="off"
        onChange={(event) => setQuery(event.target.value)} onKeyDown={(event) => { if (event.key === "Escape") setQuery(""); }}
        aria-controls={`${inputId}-topics`} className="h-11 w-full rounded-lg border border-slate-200 bg-slate-50 px-3 text-sm text-slate-800 outline-none placeholder:text-slate-500 focus:border-cyan-600 focus:ring-2 focus:ring-cyan-600/20" />
      {searching && <div className="mt-2 flex items-center justify-between gap-2 text-sm text-slate-600">
        <p role="status">{matching.length} matching {matching.length === 1 ? "guide" : "guides"}</p>
        <button type="button" onClick={() => setQuery("")} className="min-h-11 px-2 font-medium text-cyan-800 underline underline-offset-4">Clear</button>
      </div>}
    </div>
    <nav id={`${inputId}-topics`} aria-label={mobile ? "Mobile manual topics" : "Manual topics"} className="space-y-5 pb-6">
      {manualGroups.map((group) => {
        const entries = matching.filter((topic) => topic.group === group);
        if (!entries.length) return null;
        return <details key={`${group}:${searching}`} open className="group">
          <summary className="flex min-h-9 cursor-pointer list-none items-center justify-between gap-2 rounded text-xs font-semibold uppercase tracking-wider text-slate-500 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-cyan-600 [&::-webkit-details-marker]:hidden">
            {group}<span aria-hidden="true" className="text-base normal-case tracking-normal group-open:rotate-180">⌄</span>
          </summary>
          <ul className="mt-1 space-y-1">{entries.map((topic) => {
            const active = pathname === `/manual/${topic.id}`;
            return <li key={topic.id}><Link href={`/manual/${topic.id}`} aria-current={active ? "page" : undefined}
              onClick={() => { if (disclosure.current) disclosure.current.open = false; }}
              className={`block rounded-lg px-3 py-2.5 text-sm leading-5 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-cyan-600 ${active ? "bg-slate-100 font-semibold text-slate-900" : "text-slate-600 hover:bg-slate-50 hover:text-cyan-800"}`}>
              {topic.title}{searching && <span className="mt-1 block text-xs font-normal leading-5 text-slate-500">{topic.description}</span>}
            </Link></li>;
          })}</ul>
        </details>;
      })}
      {!matching.length && <div className="text-sm leading-6 text-slate-600"><p className="font-semibold text-slate-900">No matching guides</p><p className="mt-1">Try stock, receipt or request. Only guides relevant to your role are shown.</p></div>}
    </nav>
  </>;
  if (mobile) return <details ref={disclosure} className="border-b border-slate-200 bg-white lg:hidden">
    <summary className="cursor-pointer px-5 py-4 text-sm font-semibold text-slate-800 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-cyan-600">Browse the user manual</summary>
    <div className="max-h-[65dvh] overflow-y-auto px-5">{navigation}</div>
  </details>;
  return <aside className="sticky top-16 hidden h-[calc(100dvh-4rem)] w-64 shrink-0 overflow-y-auto border-r border-slate-200 px-5 py-6 lg:block xl:w-72">{navigation}</aside>;
}
