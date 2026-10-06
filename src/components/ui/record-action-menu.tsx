"use client";

import { useEffect, useRef, useState } from "react";
import { createPortal } from "react-dom";
import { IntentLink as Link } from "@/components/layout/intent-link";
import { Archive01Icon, ArrowRight01Icon, Cancel01Icon, Delete02Icon, DeliveryTruck01Icon, FileAddIcon, MoreVerticalIcon, PencilEdit02Icon, PrinterIcon, ShoppingCart01Icon, Tick02Icon, ViewIcon } from "@hugeicons/core-free-icons";
import { HugeiconsIcon } from "@hugeicons/react";

export type RecordAction = { label: string; href?: string; onSelect?: () => void; destructive?: boolean };

function actionIcon(label: string) {
  const action = label.toLowerCase();
  if (action.startsWith("view") || action.startsWith("details")) return ViewIcon;
  if (action.startsWith("edit")) return PencilEdit02Icon;
  if (action.startsWith("delete")) return Delete02Icon;
  if (action.startsWith("archive")) return Archive01Icon;
  if (action.startsWith("print")) return PrinterIcon;
  if (action.startsWith("request")) return FileAddIcon;
  if (action.startsWith("purchase")) return ShoppingCart01Icon;
  if (action.startsWith("approve") || action.startsWith("receive") || action.startsWith("record return")) return Tick02Icon;
  if (action.startsWith("reject") || action.startsWith("withdraw") || action.startsWith("cancel")) return Cancel01Icon;
  if (action.startsWith("dispatch") || action.startsWith("check out")) return DeliveryTruck01Icon;
  return ArrowRight01Icon;
}

export function RecordActionIcon({ label, name, href, onSelect, disabled = false, destructive = false, submit = false }: RecordAction & { name: string; disabled?: boolean; submit?: boolean }) {
  const icon = actionIcon(label);
  const accessibleLabel = `${label} ${name}`;
  const className = `grid size-11 place-items-center rounded-full focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-cyan-600 disabled:opacity-50 sm:size-9 ${destructive ? "text-red-600 hover:bg-red-50" : "text-slate-600 hover:bg-slate-100 hover:text-cyan-700"}`;
  if (href && disabled) return <span aria-label={accessibleLabel} aria-disabled="true" title={accessibleLabel} className={`${className} opacity-50`}><HugeiconsIcon icon={icon} size={18} aria-hidden="true" /></span>;
  return href ? <Link href={href} aria-label={accessibleLabel} title={accessibleLabel} className={className}><HugeiconsIcon icon={icon} size={18} aria-hidden="true" /></Link>
    : <button type={submit ? "submit" : "button"} disabled={disabled} onClick={onSelect} aria-label={accessibleLabel} title={accessibleLabel} className={className}><HugeiconsIcon icon={icon} size={18} aria-hidden="true" /></button>;
}

export function RecordActionMenu({ name, actions, disabled = false, triggerLabel }: { name: string; actions: RecordAction[]; disabled?: boolean; triggerLabel?: string }) {
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
    const height = actions.length * 44 + 12;
    setPosition({ top: bounds.bottom + height + 8 > window.innerHeight ? Math.max(8, bounds.top - height - 6) : bounds.bottom + 6, right: Math.max(8, window.innerWidth - bounds.right) });
  }

  if (!actions.length) return null;
  if (actions.length <= 2) return <div className="flex items-center justify-end gap-1">{actions.map((action) => <RecordActionIcon key={action.label} {...action} name={name} disabled={disabled} />)}</div>;

  return <>
    <button ref={trigger} type="button" disabled={disabled} onClick={toggle} aria-label={triggerLabel ?? `Actions for ${name}`} title={triggerLabel ?? `Actions for ${name}`} aria-haspopup="menu" aria-expanded={Boolean(position)} className={`inline-flex min-h-11 items-center justify-center gap-1.5 rounded-full border border-slate-200 bg-white px-3 text-sm text-slate-600 hover:border-cyan-300 hover:bg-cyan-50 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-cyan-600 disabled:opacity-50 sm:min-h-9 ${triggerLabel ? "" : "sm:w-9 sm:px-0"}`}><HugeiconsIcon icon={MoreVerticalIcon} size={18} /><span className={triggerLabel ? "" : "sm:hidden"}>{triggerLabel ?? "Actions"}</span></button>
    {position && createPortal(<div ref={menu} role="menu" aria-label={`Actions for ${name}`} style={position} className="fixed z-[90] max-h-[min(70vh,24rem)] w-44 overflow-y-auto rounded-xl border border-slate-200 bg-white p-1.5 text-sm text-slate-700 shadow-xl" onKeyDown={(event) => {
      const items = Array.from(menu.current?.querySelectorAll<HTMLElement>("a,button") ?? []);
      const index = items.indexOf(document.activeElement as HTMLElement);
      if (event.key === "ArrowDown" || event.key === "ArrowUp") { event.preventDefault(); items[(index + (event.key === "ArrowDown" ? 1 : items.length - 1)) % items.length]?.focus(); }
      else if (event.key === "Home") { event.preventDefault(); items[0]?.focus(); }
      else if (event.key === "End") { event.preventDefault(); items.at(-1)?.focus(); }
    }}>{actions.map((action) => {
      const className = `flex min-h-11 w-full items-center gap-2 rounded-lg px-3 py-2 text-left focus-visible:outline-none ${action.destructive ? "text-red-600 hover:bg-red-50 focus-visible:bg-red-50" : "hover:bg-slate-50 focus-visible:bg-slate-50"}`;
      const icon = actionIcon(action.label);
      const content = <><HugeiconsIcon icon={icon} size={16} aria-hidden="true" /><span>{action.label}</span></>;
      return action.href ? <Link role="menuitem" key={action.label} href={action.href} onClick={() => setPosition(null)} className={className}>{content}</Link> : <button role="menuitem" key={action.label} type="button" onClick={() => { setPosition(null); action.onSelect?.(); }} className={className}>{content}</button>;
    })}</div>, document.body)}
  </>;
}
