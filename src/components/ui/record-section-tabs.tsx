"use client";

import { useId, useRef, useState, type ReactNode } from "react";

export type RecordSection = { id: string; label: string; content: ReactNode };

/** Keeps server-rendered record sections mounted while showing one section at a time. */
export function RecordSectionTabs({ sections, initialSection }: { sections: RecordSection[]; initialSection: string }) {
  const id = useId();
  const list = useRef<HTMLDivElement>(null);
  const initial = sections.some(section => section.id === initialSection) ? initialSection : sections[0]?.id;
  const [selection, setSelection] = useState({ initial, active: initial });
  if (selection.initial !== initial) setSelection({ initial, active: initial });
  const active = sections.some(section => section.id === selection.active) ? selection.active : initial;
  if (!sections.length) return null;
  return <div className="mt-6 min-w-0">
    <div ref={list} role="tablist" aria-label="Record sections" className="flex flex-wrap gap-1 border-b border-slate-200" onKeyDown={event => {
      const index = sections.findIndex(section => section.id === active);
      const next = event.key === "ArrowRight" ? (index + 1) % sections.length : event.key === "ArrowLeft" ? (index - 1 + sections.length) % sections.length : event.key === "Home" ? 0 : event.key === "End" ? sections.length - 1 : -1;
      if (next < 0) return;
      event.preventDefault();
      setSelection({ initial, active: sections[next].id });
      list.current?.querySelectorAll<HTMLButtonElement>('[role="tab"]')[next]?.focus();
    }}>
      {sections.map(section => <button key={section.id} type="button" role="tab" id={`${id}-${section.id}-tab`} aria-selected={active === section.id} aria-controls={`${id}-${section.id}-panel`} tabIndex={active === section.id ? 0 : -1} onClick={() => setSelection({ initial, active: section.id })}
        className={`min-h-11 border-b-2 px-2 py-3 text-xs font-semibold sm:px-4 sm:text-sm outline-none transition-colors focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-cyan-600 ${active === section.id ? "border-cyan-600 text-cyan-800" : "border-transparent text-slate-500 hover:bg-slate-100 hover:text-slate-900"}`}>{section.label}</button>)}
    </div>
    {sections.map(section => <div key={section.id} role="tabpanel" id={`${id}-${section.id}-panel`} aria-labelledby={`${id}-${section.id}-tab`} hidden={active !== section.id} tabIndex={0} className="pt-5 outline-none focus-visible:ring-2 focus-visible:ring-cyan-600">{section.content}</div>)}
  </div>;
}
