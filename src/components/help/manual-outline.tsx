"use client";

import { useEffect, useState } from "react";

export type ManualSection = { id: string; title: string };

export function ManualOutline({ sections }: { sections: ManualSection[] }) {
  const [active, setActive] = useState(sections[0]?.id);
  useEffect(() => {
    const visible = new Set<string>();
    const observer = new IntersectionObserver((entries) => {
      for (const entry of entries) {
        if (entry.isIntersecting) visible.add(entry.target.id);
        else visible.delete(entry.target.id);
      }
      const first = sections.find((section) => visible.has(section.id));
      if (first) setActive(first.id);
    }, { rootMargin: "-90px 0px -55% 0px" });
    for (const section of sections) {
      const element = document.getElementById(section.id);
      if (element) observer.observe(element);
    }
    return () => observer.disconnect();
  }, [sections]);
  const links = <ul className="mt-4 space-y-1">{sections.map((section) => <li key={section.id}>
    <a href={`#${section.id}`} aria-current={active === section.id ? "location" : undefined} onClick={() => setActive(section.id)}
      className={`block rounded py-2 text-sm leading-5 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-cyan-600 ${active === section.id ? "font-semibold text-cyan-800" : "text-slate-500 hover:text-cyan-800"}`}>{section.title}</a>
  </li>)}</ul>;
  return <>
    <details className="mb-8 rounded-lg border border-slate-200 px-4 xl:hidden">
      <summary className="cursor-pointer py-3 text-sm font-semibold text-slate-700">On this page</summary>
      <nav aria-label="On this page" className="pb-4">{links}</nav>
    </details>
    <aside className="sticky top-24 col-start-2 row-start-1 hidden max-h-[calc(100dvh-7rem)] overflow-y-auto border-l border-slate-200 pl-6 xl:block">
      <nav aria-label="On this page"><p className="text-xs font-semibold uppercase tracking-wider text-slate-500">On this page</p>{links}</nav>
    </aside>
  </>;
}
