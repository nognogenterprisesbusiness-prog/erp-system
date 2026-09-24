"use client";

import { useEffect, useRef, useState } from "react";
import { createPortal } from "react-dom";
import Link from "next/link";
import { MoreVerticalIcon } from "@hugeicons/core-free-icons";
import { HugeiconsIcon } from "@hugeicons/react";

export type RecordAction = { label: string; href?: string; onSelect?: () => void; destructive?: boolean };

export function RecordActionMenu({ name, actions, disabled = false }: { name: string; actions: RecordAction[]; disabled?: boolean }) {
  const trigger = useRef<HTMLButtonElement>(null);
  const menu = useRef<HTMLDivElement>(null);
  const [position, setPosition] = useState<{ top: number; right: number } | null>(null);

  useEffect(() => {
    if (!position) return;
    const dismiss = (event: PointerEvent) => { if (!trigger.current?.contains(event.target as Node) && !menu.current?.contains(event.target as Node)) setPosition(null); };
    const escape = (event: KeyboardEvent) => { if (event.key === "Escape") { setPosition(null); trigger.current?.focus(); } };
    const close = () => setPosition(null);
    document.addEventListener("pointerdown", dismiss);
    document.addEventListener("keydown", escape);
    window.addEventListener("resize", close);
    window.addEventListener("scroll", close, true);
    menu.current?.querySelector<HTMLElement>("a,button")?.focus();
    return () => { document.removeEventListener("pointerdown", dismiss); document.removeEventListener("keydown", escape); window.removeEventListener("resize", close); window.removeEventListener("scroll", close, true); };
  }, [position]);

  function toggle() {
    if (position) return setPosition(null);
    const bounds = trigger.current?.getBoundingClientRect();
    if (!bounds) return;
    const height = actions.length * 40 + 12;
    setPosition({ top: bounds.bottom + height + 8 > window.innerHeight ? Math.max(8, bounds.top - height - 6) : bounds.bottom + 6, right: Math.max(8, window.innerWidth - bounds.right) });
  }

  return <>
    <button ref={trigger} type="button" disabled={disabled} onClick={toggle} aria-label={`Actions for ${name}`} aria-haspopup="menu" aria-expanded={Boolean(position)} className="inline-grid size-9 place-items-center rounded-full border border-slate-200 bg-white text-slate-600 hover:border-cyan-300 hover:bg-cyan-50 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-cyan-600 disabled:opacity-50"><HugeiconsIcon icon={MoreVerticalIcon} size={18} /></button>
    {position && createPortal(<div ref={menu} role="menu" aria-label={`Actions for ${name}`} style={position} className="fixed z-[90] w-40 rounded-xl border border-slate-200 bg-white p-1.5 text-sm text-slate-700 shadow-xl" onKeyDown={(event) => {
      const items = Array.from(menu.current?.querySelectorAll<HTMLElement>("a,button") ?? []);
      const index = items.indexOf(document.activeElement as HTMLElement);
      if (event.key === "ArrowDown" || event.key === "ArrowUp") { event.preventDefault(); items[(index + (event.key === "ArrowDown" ? 1 : items.length - 1)) % items.length]?.focus(); }
    }}>{actions.map((action) => {
      const className = `block w-full rounded-lg px-3 py-2 text-left focus-visible:outline-none ${action.destructive ? "text-red-600 hover:bg-red-50 focus-visible:bg-red-50" : "hover:bg-slate-50 focus-visible:bg-slate-50"}`;
      return action.href ? <Link role="menuitem" key={action.label} href={action.href} onClick={() => setPosition(null)} className={className}>{action.label}</Link> : <button role="menuitem" key={action.label} type="button" onClick={() => { setPosition(null); action.onSelect?.(); }} className={className}>{action.label}</button>;
    })}</div>, document.body)}
  </>;
}
