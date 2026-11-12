"use client";

import { useEffect, useRef, useState } from "react";
import { createPortal } from "react-dom";
import { IntentLink as Link } from "@/components/layout/intent-link";
import { Archive01Icon, ViewIcon, UserBlock01Icon, UserCheck01Icon, Key01Icon, Download04Icon, CreditCardIcon, Cancel01Icon, Delete02Icon, DeliveryTruck01Icon, FileAddIcon, MoreVerticalIcon, PencilEdit02Icon, PrinterIcon, ShoppingCart01Icon, Tick02Icon } from "@hugeicons/core-free-icons";
import { HugeiconsIcon } from "@hugeicons/react";

export type RecordAction = { label: string; href?: string; onSelect?: () => void; destructive?: boolean; native?: boolean; target?: "_blank" };
const isViewAction = (label: string) => /^(view|details)(\s|$)/i.test(label);

function actionIcon(label: string) {
  const action = label.toLowerCase();
  if (isViewAction(label)) return ViewIcon;
  if (action.startsWith("deactivate")) return UserBlock01Icon;
  if (action.startsWith("reactivate")) return UserCheck01Icon;
  if (action.startsWith("reset password")) return Key01Icon;
  if (action.startsWith("download")) return Download04Icon;
  if (action.includes("payment") || action.startsWith("reimburse")) return CreditCardIcon;
  if (action.includes("assignment") || action.startsWith("assign role")) return PencilEdit02Icon;
  if (action.startsWith("edit") || action.startsWith("correct") || action.startsWith("rename")) return PencilEdit02Icon;
  if (action.startsWith("delete")) return Delete02Icon;
  if (action.startsWith("archive")) return Archive01Icon;
  if (action.startsWith("print")) return PrinterIcon;
  if (action.startsWith("request")) return FileAddIcon;
  if (action.startsWith("purchase") || action.startsWith("use quote")) return ShoppingCart01Icon;
  if (action.startsWith("approve") || action.startsWith("receive") || action.startsWith("record return")) return Tick02Icon;
  if (action.startsWith("reject") || action.startsWith("withdraw") || action.startsWith("cancel")) return Cancel01Icon;
  if (action.startsWith("dispatch") || action.startsWith("check out") || action.startsWith("hand over")) return DeliveryTruck01Icon;
  return undefined;
}

export function RecordActionIcon({ label, name, href, native, target, onSelect, disabled = false, destructive = false, submit = false }: RecordAction & { name: string; disabled?: boolean; submit?: boolean }) {
  const icon = actionIcon(label);
  const accessibleLabel = `${label} ${name}`;
  const className = `inline-flex min-h-11 items-center justify-center gap-2 whitespace-nowrap rounded-full border border-slate-200 bg-white px-3 text-sm font-semibold focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-cyan-600 disabled:opacity-50 sm:min-h-9 sm:text-xs ${destructive ? "text-red-600 hover:bg-red-50" : "text-slate-600 hover:bg-slate-100 hover:text-cyan-700"}`;
  const content = <>{!isViewAction(label) && icon && <HugeiconsIcon icon={icon} size={16} aria-hidden="true" />}<span>{label}</span></>;
  if (href && disabled) return <span aria-label={accessibleLabel} aria-disabled="true" title={accessibleLabel} className={`${className} opacity-50`}>{content}</span>;
  if (href && native) return <a href={href} target={target} rel={target ? "noopener noreferrer" : undefined} aria-label={accessibleLabel} title={accessibleLabel} className={className}>{content}</a>;
  return href ? <Link href={href} aria-label={accessibleLabel} title={accessibleLabel} className={className}>{content}</Link>
    : <button type={submit ? "submit" : "button"} disabled={disabled} onClick={onSelect} aria-label={accessibleLabel} title={accessibleLabel} className={className}>{content}</button>;
}

export function RecordActionMenu({ name, actions, disabled = false, triggerLabel }: { name: string; actions: RecordAction[]; disabled?: boolean; triggerLabel?: string }) {
  const trigger = useRef<HTMLButtonElement>(null);
  const menu = useRef<HTMLDivElement>(null);
  const [position, setPosition] = useState<{ top: number; right: number; container: HTMLElement } | null>(null);
  const menuActions = actions;

  useEffect(() => {
    if (!position) return;
    const dismiss = (event: PointerEvent) => { if (!trigger.current?.contains(event.target as Node) && !menu.current?.contains(event.target as Node)) setPosition(null); };
    const escape = (event: KeyboardEvent) => { if (event.key === "Escape") { event.preventDefault(); event.stopPropagation(); setPosition(null); trigger.current?.focus(); } };
    const close = () => setPosition(null);
    document.addEventListener("pointerdown", dismiss);
    document.addEventListener("keydown", escape, true);
    window.addEventListener("resize", close);
    window.addEventListener("scroll", close, true);
    menu.current?.querySelector<HTMLElement>("a,button")?.focus();
    return () => { document.removeEventListener("pointerdown", dismiss); document.removeEventListener("keydown", escape, true); window.removeEventListener("resize", close); window.removeEventListener("scroll", close, true); };
  }, [position]);

  function toggle() {
    if (position) return setPosition(null);
    const bounds = trigger.current?.getBoundingClientRect();
    if (!bounds) return;
    const height = menuActions.length * 44 + 12;
    setPosition({ top: bounds.bottom + height + 8 > window.innerHeight ? Math.max(8, bounds.top - height - 6) : bounds.bottom + 6, right: Math.max(8, window.innerWidth - bounds.right), container: trigger.current?.closest("dialog") ?? document.body });
  }

  if (!actions.length) return null;
  if (actions.length === 1) return <div className="flex items-center justify-end gap-2"><RecordActionIcon {...actions[0]} name={name} disabled={disabled} /></div>;

  return <div className="inline-flex shrink-0 items-center justify-end gap-2">
    <button ref={trigger} type="button" disabled={disabled} onClick={toggle} aria-label={triggerLabel ?? `Actions for ${name}`} title={triggerLabel ?? `Actions for ${name}`} aria-haspopup="menu" aria-expanded={Boolean(position)} className="inline-flex size-11 shrink-0 items-center justify-center rounded-full border border-slate-200 bg-white text-slate-600 hover:border-cyan-300 hover:bg-cyan-50 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-cyan-600 disabled:opacity-50 sm:size-9"><HugeiconsIcon icon={MoreVerticalIcon} size={18} aria-hidden="true" /></button>
    {position && createPortal(<div ref={menu} role="menu" aria-label={`Actions for ${name}`} style={{ top: position.top, right: position.right }} className="fixed z-[90] max-h-[min(70vh,24rem)] w-44 overflow-y-auto rounded-xl border border-slate-200 bg-white p-1.5 text-sm text-slate-700 shadow-xl" onKeyDown={(event) => {
      const items = Array.from(menu.current?.querySelectorAll<HTMLElement>("a,button") ?? []);
      const index = items.indexOf(document.activeElement as HTMLElement);
      if (event.key === "ArrowDown" || event.key === "ArrowUp") { event.preventDefault(); items[(index + (event.key === "ArrowDown" ? 1 : items.length - 1)) % items.length]?.focus(); }
      else if (event.key === "Home") { event.preventDefault(); items[0]?.focus(); }
      else if (event.key === "End") { event.preventDefault(); items.at(-1)?.focus(); }
    }}>{menuActions.map((action) => {
      const className = `flex min-h-11 w-full items-center gap-2 rounded-lg px-3 py-2 text-left focus-visible:outline-none ${action.destructive ? "text-red-600 hover:bg-red-50 focus-visible:bg-red-50" : "hover:bg-slate-50 focus-visible:bg-slate-50"}`;
      const icon = actionIcon(action.label);
      const content = <>{icon && <HugeiconsIcon icon={icon} size={16} aria-hidden="true" />}<span>{action.label}</span></>;
      if (action.href && action.native) return <a role="menuitem" key={action.label} href={action.href} target={action.target} rel={action.target ? "noopener noreferrer" : undefined} onClick={() => setPosition(null)} className={className}>{content}</a>;
      return action.href ? <Link role="menuitem" key={action.label} href={action.href} onClick={() => setPosition(null)} className={className}>{content}</Link> : <button role="menuitem" key={action.label} type="button" onClick={() => { setPosition(null); action.onSelect?.(); }} className={className}>{content}</button>;
    })}</div>, position.container)}
  </div>;
}
