"use client";

import { Cancel01Icon, Notification01Icon } from "@hugeicons/core-free-icons";
import { HugeiconsIcon } from "@hugeicons/react";
import { EmptyState } from "@/components/ui/empty-state";
import type { DemoData } from "@/lib/demo/schema";

export function DemoNotificationBell({ notifications, onRead, onMarkAllUnread }: { notifications: DemoData["notifications"]; onRead: (id: string) => void; onMarkAllUnread: () => void }) {
  const unread = notifications.filter((item) => !item.read).length;
  const read = notifications.length - unread;
  return <details data-header-menu="notifications" className="relative"><summary aria-label={`Notifications${unread ? `, ${unread} unread` : ""}`} className="relative grid size-9 cursor-pointer list-none place-items-center rounded-lg text-slate-600 hover:bg-slate-100 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-cyan-600 [&::-webkit-details-marker]:hidden"><HugeiconsIcon icon={Notification01Icon} size={19} />{unread > 0 && <span className="absolute -right-0.5 -top-0.5 min-w-4 rounded-full bg-cyan-600 px-1 text-center text-[10px] font-semibold leading-4 text-white">{unread}</span>}</summary>
    <div className="fixed inset-x-3 top-16 z-50 max-h-[calc(100svh-8rem)] overflow-hidden rounded-xl border border-slate-200 bg-white shadow-xl sm:absolute sm:inset-x-auto sm:right-0 sm:top-auto sm:mt-2 sm:w-[350px]">
      <div className="grid grid-cols-[1fr_auto] items-center gap-x-2 border-b border-slate-100 px-4 py-3"><h2 className="text-lg font-semibold text-slate-900">Notifications</h2><button type="button" aria-label="Close notifications" onClick={(event) => event.currentTarget.closest("details")?.removeAttribute("open")} className="grid size-8 place-items-center rounded-full text-slate-500 hover:bg-slate-100"><HugeiconsIcon icon={Cancel01Icon} size={17} /></button>{read > 0 && <button type="button" onClick={onMarkAllUnread} className="col-span-2 mt-1 justify-self-start rounded-full py-1 text-xs font-semibold text-cyan-700 hover:underline">Mark all as unread</button>}</div>
      {notifications.length === 0 ? <EmptyState kind="notifications" title="No notifications yet" className="py-5" /> : <ul className="max-h-[calc(100svh-13rem)] divide-y divide-slate-100 overflow-auto sm:max-h-80">{notifications.toSorted((a, b) => b.date.localeCompare(a.date)).map((item) => <li key={item.id} className={item.read ? "" : "bg-cyan-50/50"}><div className="px-4 py-3"><div className="flex items-start gap-2"><span aria-hidden className={`mt-1.5 size-2 shrink-0 rounded-full ${item.read ? "bg-transparent" : "bg-cyan-600"}`} /><div className="min-w-0 flex-1"><p className="text-sm font-semibold text-slate-900">{item.title ?? (item.message.includes("daily report") ? "Daily report ready" : item.message.includes("stock") ? "Stock update" : "Activity update")}</p><p className="mt-1 text-xs leading-5 text-slate-600">{item.message}</p><div className="mt-1 flex items-center justify-between gap-2 text-xs text-slate-500"><time>{item.date}</time>{!item.read && <button type="button" onClick={() => onRead(item.id)} className="font-medium text-cyan-700 hover:underline">Mark read</button>}</div></div></div></div></li>)}</ul>}
    </div>
  </details>;
}
