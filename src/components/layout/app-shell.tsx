"use client";

import { useEffect, useId, useState } from "react";
import Image from "next/image";
import { IntentLink as Link } from "./intent-link";
import { usePathname } from "next/navigation";
import { ArrowDown01Icon, Cancel01Icon, Menu01Icon, PanelLeftCloseIcon, PanelLeftOpenIcon, Settings01Icon } from "@hugeicons/core-free-icons";
import { HugeiconsIcon, type IconSvgElement } from "@hugeicons/react";

import { Button } from "@/components/ui/button";
import { AccountAvatar } from "@/components/ui/account-avatar";
import { HistoryLink } from "@/components/layout/history-link";
import { ThemeToggle } from "@/components/layout/theme-toggle";
import { cn } from "@/lib/utils";

export type ShellNavItem = { href: string; label: string; icon: IconSvgElement; group?: string; nested?: boolean };
type FooterAction = { label: string; icon: IconSvgElement; onClick: () => void };
type NavigationMode = "client" | "document" | "history";

function SidebarLink({ item, active, compact, navigationMode, onNavigate }: { item: ShellNavItem; active: boolean; compact: boolean; navigationMode: NavigationMode; onNavigate?: () => void }) {
  const className = cn("flex h-10 items-center gap-3 rounded-lg px-3 text-sm font-normal transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-cyan-400", item.nested && !compact && "pl-10 text-[13px]", compact && "justify-center px-0", active ? "bg-cyan-400/12 font-medium text-cyan-200" : "hover:bg-white/6 hover:text-white");
  const content = <><HugeiconsIcon icon={item.icon} size={item.nested ? 16 : 19} strokeWidth={1.7} className="shrink-0" /><span className={compact ? "sr-only" : "truncate"}>{item.label}</span></>;
  return navigationMode === "document"
    ? <a href={item.href} onClick={onNavigate} aria-current={active ? "page" : undefined} aria-label={compact ? item.label : undefined} title={compact ? item.label : undefined} className={className}>{content}</a>
    : navigationMode === "history"
      ? <HistoryLink href={item.href} onClick={onNavigate} aria-current={active ? "page" : undefined} aria-label={compact ? item.label : undefined} title={compact ? item.label : undefined} className={className}>{content}</HistoryLink>
      : <Link href={item.href} onClick={onNavigate} aria-current={active ? "page" : undefined} aria-label={compact ? item.label : undefined} title={compact ? item.label : undefined} className={className}>{content}</Link>;
}

function Sidebar({ items, footerItems = [], footerAction, homeHref, pathname, navigationMode, collapsedGroups, onToggleGroup, compact = false, onToggle, onNavigate }: { items: ShellNavItem[]; footerItems?: ShellNavItem[]; footerAction?: FooterAction; homeHref: string; pathname: string; navigationMode: NavigationMode; collapsedGroups: string[]; onToggleGroup: (group: string) => void; compact?: boolean; onToggle?: () => void; onNavigate?: () => void }) {
  const navigationId = useId();
  const groups = [...new Set(items.map((item) => item.group ?? "Workspace"))];
  const brand = navigationMode === "document"
    ? <a href={homeHref} aria-label="Nognog Enterprises home" className={cn("flex min-w-0 items-center gap-3", compact ? "justify-center" : "px-2")} onClick={onNavigate}><Brand compact={compact} /></a>
    : navigationMode === "history"
      ? <HistoryLink href={homeHref} aria-label="Nognog Enterprises home" className={cn("flex min-w-0 items-center gap-3", compact ? "justify-center" : "px-2")} onClick={onNavigate}><Brand compact={compact} /></HistoryLink>
      : <Link href={homeHref} aria-label="Nognog Enterprises home" className={cn("flex min-w-0 items-center gap-3", compact ? "justify-center" : "px-2")} onClick={onNavigate}><Brand compact={compact} /></Link>;
  return <aside data-erp-sidebar className={cn("flex h-full w-full flex-col overflow-y-auto overscroll-contain bg-[#061228] py-5 text-slate-300", compact ? "px-3" : "px-4")}>
    <div className={cn("flex shrink-0", compact ? "flex-col items-center gap-3" : "items-center justify-between")}>
      {brand}
      {onToggle ? <button type="button" onClick={onToggle} aria-label={compact ? "Expand sidebar" : "Collapse sidebar"} title={compact ? "Expand sidebar" : "Collapse sidebar"} className="grid size-9 shrink-0 place-items-center rounded-lg text-slate-400 hover:bg-white/10 hover:text-white focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-cyan-400"><HugeiconsIcon icon={compact ? PanelLeftOpenIcon : PanelLeftCloseIcon} size={19} /></button> : null}
    </div>
    <nav className={cn("flex-1", compact ? "mt-5" : "mt-9")} aria-label="Main navigation">
      <div className="space-y-5">{groups.map((group, index) => {
        const expanded = compact || !collapsedGroups.includes(group);
        const panelId = `${navigationId}-group-${index}`;
        return <section key={group} aria-label={group}>
          {compact ? <p className="sr-only">{group}</p> : <button type="button" aria-expanded={expanded} aria-controls={panelId} onClick={() => onToggleGroup(group)} className="mb-2 flex min-h-9 w-full items-center justify-between gap-2 rounded-lg px-3 text-left text-xs font-medium text-slate-400 hover:bg-white/6 hover:text-white focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-cyan-400">
            <span>{group}</span><HugeiconsIcon icon={ArrowDown01Icon} size={15} strokeWidth={1.7} className={cn("shrink-0 transition-transform motion-reduce:transition-none", !expanded && "-rotate-90")} />
          </button>}
          <div id={panelId} hidden={!expanded} className="space-y-1">{items.filter((item) => (item.group ?? "Workspace") === group).map((item) => <SidebarLink key={item.href} item={item} active={(pathname === item.href || (item.href !== homeHref && pathname.startsWith(`${item.href}/`))) && !items.some((other) => other.href !== item.href && other.href.length > item.href.length && (pathname === other.href || pathname.startsWith(`${other.href}/`)))} compact={compact} navigationMode={navigationMode} onNavigate={onNavigate} />)}</div>
        </section>;
      })}</div>
    </nav>
    {(footerItems.length > 0 || footerAction) && <nav className="mt-5 border-t border-white/10 pt-5" aria-label="Support and account">
      {footerItems.length > 0 && !compact && <button type="button" aria-expanded={!collapsedGroups.includes("Settings")} aria-controls={`${navigationId}-settings`} onClick={() => onToggleGroup("Settings")} className="flex h-10 w-full items-center justify-between gap-3 rounded-lg px-3 text-left text-sm font-normal hover:bg-white/6 hover:text-white focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-cyan-400"><span className="flex items-center gap-3"><HugeiconsIcon icon={Settings01Icon} size={19} strokeWidth={1.7} />Settings</span><HugeiconsIcon icon={ArrowDown01Icon} size={15} strokeWidth={1.7} className={cn("transition-transform motion-reduce:transition-none", collapsedGroups.includes("Settings") && "-rotate-90")} /></button>}
      <div id={`${navigationId}-settings`} hidden={!compact && collapsedGroups.includes("Settings")} className={cn("space-y-1", !compact && "pl-3")}>
        {footerItems.map((item) => <SidebarLink key={item.href} item={item} active={pathname === item.href} compact={compact} navigationMode={navigationMode} onNavigate={onNavigate} />)}
      </div>
      {footerAction && <button type="button" onClick={() => { footerAction.onClick(); onNavigate?.(); }} aria-label={compact ? footerAction.label : undefined} title={compact ? footerAction.label : undefined} className={cn("flex h-10 w-full items-center gap-3 rounded-lg px-3 text-left text-sm font-normal hover:bg-white/6 hover:text-white focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-cyan-400", compact && "justify-center px-0")}><HugeiconsIcon icon={footerAction.icon} size={19} strokeWidth={1.7} className="shrink-0" /><span className={compact ? "sr-only" : ""}>{footerAction.label}</span></button>}
    </nav>}
  </aside>;
}

function Brand({ compact }: { compact: boolean }) {
  return <>
      <Image src="/logo-nognog.webp" alt="Nognog Enterprises" width={38} height={38} priority />
      {!compact && <div><p className="text-sm font-semibold tracking-[0.1em] text-white">NOGNOG</p><p className="text-[9px] font-medium tracking-[0.27em] text-cyan-300">ENTERPRISES</p></div>}
    </>;
}

export function AppShell({ children, name, avatar, roleLabel, items, footerItems, footerAction, homeHref, headerActions, headerSearch, profileActions, banner, activeHref, navigationMode = "client" }: {
  children: React.ReactNode;
  name: string;
  avatar?: string | null;
  roleLabel: string;
  items: ShellNavItem[];
  footerItems?: ShellNavItem[];
  footerAction?: FooterAction;
  homeHref: string;
  headerActions?: React.ReactNode;
  headerSearch?: React.ReactNode;
  profileActions?: React.ReactNode;
  banner?: React.ReactNode;
  activeHref?: string;
  navigationMode?: NavigationMode;
}) {
  const pathname = usePathname();
  const [sidebarOpen, setSidebarOpen] = useState(false);
  const [sidebarCollapsed, setSidebarCollapsed] = useState(false);
  const [collapsedGroups, setCollapsedGroups] = useState<string[]>(() => ["/profile", "/notifications", "/help"].includes(pathname) ? [] : ["Settings"]);
  function toggleGroup(group: string) {
    setCollapsedGroups((current) => current.includes(group) ? current.filter((item) => item !== group) : [...current, group]);
  }
  useEffect(() => {
    queueMicrotask(() => {
      try { setSidebarCollapsed(window.localStorage.getItem("nognog.sidebar.collapsed") === "1"); }
      catch { /* The sidebar remains expanded if browser storage is unavailable. */ }
    });
  }, []);
  useEffect(() => {
    if (!sidebarOpen) return;
    const previousOverflow = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    const closeOnEscape = (event: KeyboardEvent) => { if (event.key === "Escape") setSidebarOpen(false); };
    document.addEventListener("keydown", closeOnEscape);
    return () => { document.body.style.overflow = previousOverflow; document.removeEventListener("keydown", closeOnEscape); };
  }, [sidebarOpen]);
  useEffect(() => {
    const closeOtherHeaderMenus = (event: Event) => {
      const opened = event.target;
      if (!(opened instanceof HTMLDetailsElement) || !opened.open || !opened.dataset.headerMenu) return;
      document.querySelectorAll<HTMLDetailsElement>("details[data-header-menu]").forEach((menu) => {
        if (menu !== opened) menu.open = false;
      });
    };
    document.addEventListener("toggle", closeOtherHeaderMenus, true);
    return () => document.removeEventListener("toggle", closeOtherHeaderMenus, true);
  }, []);
  function toggleSidebar() {
    setSidebarCollapsed((current) => {
      const next = !current;
      try { window.localStorage.setItem("nognog.sidebar.collapsed", next ? "1" : "0"); }
      catch { /* The control still works for this page. */ }
      return next;
    });
  }
  return <div className="min-h-svh bg-[#f5f6f8] text-[#07152d]">
    {banner ? <div className="sticky top-0 z-50">{banner}</div> : null}
    <div className={cn("fixed bottom-0 left-0 z-40 hidden transition-[width] duration-200 lg:block", banner ? "top-11" : "top-0", sidebarCollapsed ? "w-[76px]" : "w-[264px]")}><Sidebar collapsedGroups={collapsedGroups} onToggleGroup={toggleGroup} items={items} footerItems={footerItems} footerAction={footerAction} homeHref={homeHref} pathname={activeHref ?? pathname} navigationMode={navigationMode} compact={sidebarCollapsed} onToggle={toggleSidebar} /></div>
    {sidebarOpen && <div role="dialog" aria-modal="true" aria-label="Navigation" className="fixed inset-0 z-50 lg:hidden">
      <button className="absolute inset-0 bg-slate-950/50 backdrop-blur-sm" aria-label="Close navigation" onClick={() => setSidebarOpen(false)} />
      <div className="relative h-full w-[min(88vw,280px)] shadow-2xl"><Sidebar collapsedGroups={collapsedGroups} onToggleGroup={toggleGroup} items={items} footerItems={footerItems} footerAction={footerAction} homeHref={homeHref} pathname={activeHref ?? pathname} navigationMode={navigationMode} onNavigate={() => setSidebarOpen(false)} /><button onClick={() => setSidebarOpen(false)} aria-label="Close navigation" className="absolute right-3 top-4 grid size-9 place-items-center rounded-lg text-slate-300 hover:bg-white/10"><HugeiconsIcon icon={Cancel01Icon} size={20} /></button></div>
    </div>}
    <div className={cn("transition-[padding] duration-200", sidebarCollapsed ? "lg:pl-[76px]" : "lg:pl-[264px]")}>
      <header className={cn("sticky z-30 flex h-16 items-center border-b border-slate-200/80 bg-white/95 px-4 backdrop-blur-xl sm:px-6 xl:px-8", banner ? "top-11" : "top-0")}>
        <Button variant="ghost" size="icon" className="mr-2 lg:hidden" onClick={() => setSidebarOpen(true)} aria-label="Open navigation"><HugeiconsIcon icon={Menu01Icon} size={21} /></Button>
        {headerSearch ? <div className="min-w-0 max-w-[320px] flex-1">{headerSearch}</div> : null}
        <div className="ml-auto flex items-center gap-2 sm:gap-3">
          <ThemeToggle />
          {headerActions}
          <details data-header-menu="profile" className="relative group"><summary className="flex cursor-pointer list-none items-center gap-2 rounded-xl px-1.5 py-1 hover:bg-slate-100 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-cyan-600 [&::-webkit-details-marker]:hidden" aria-label={`Profile menu for ${name}`}>
            <AccountAvatar key={avatar ?? ""} name={name} photo={avatar ?? undefined} className="bg-[#07152d] font-bold text-white" />
            <span className="hidden min-w-0 text-left sm:block"><span className="block truncate text-sm font-semibold text-slate-800">{name}</span><span className="block truncate text-xs capitalize text-slate-500">{roleLabel.replaceAll("_", " ")}</span></span>
            <HugeiconsIcon icon={ArrowDown01Icon} size={14} className="hidden text-slate-400 sm:block" />
          </summary><div className="absolute right-0 z-50 mt-2 w-56 rounded-xl border border-slate-200 bg-white p-2 shadow-xl"><div className="border-b border-slate-100 px-3 py-2"><p className="truncate text-sm font-semibold">{name}</p><p className="text-xs capitalize text-slate-500">{roleLabel.replaceAll("_", " ")}</p></div><div className="pt-1">{profileActions ?? <p className="px-3 py-2 text-sm text-slate-500">Account options are not available.</p>}</div></div></details>
        </div>
      </header>
      <main className="mx-auto max-w-[1600px] px-4 py-6 sm:px-6 lg:py-8 xl:px-8">{children}</main>
    </div>
  </div>;
}
