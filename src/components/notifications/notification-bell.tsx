"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { Cancel01Icon, Notification01Icon } from "@hugeicons/core-free-icons";
import { HugeiconsIcon } from "@hugeicons/react";
import { createClient } from "@/lib/supabase/browser";
import type { NotificationRow } from "@/types/database";
import { EmptyState } from "@/components/ui/empty-state";
import { MarkAllNotificationsUnread } from "./notification-actions";

export function NotificationBell({ userId }: { userId: string }) {
  const [unreadCount, setUnreadCount] = useState(0);
  const [recent, setRecent] = useState<NotificationRow[]>([]);
  const [loadError, setLoadError] = useState(false);

  useEffect(() => {
    let mounted = true;
    let latestRequest = 0;
    const supabase = createClient();
    const refresh = async () => {
      const requestId = ++latestRequest;
      const [{ data: count, error: countError }, { data: items, error: itemsError }] = await Promise.all([
        supabase.rpc("get_unread_notification_count"),
        supabase.from("notifications").select("*").or(`expires_at.is.null,expires_at.gt.${new Date().toISOString()}`).order("created_at", { ascending: false }).limit(5),
      ]);
      if (!mounted || requestId !== latestRequest) return;
      if (countError || itemsError) { setLoadError(true); return; }
      setUnreadCount(count ?? 0);
      setRecent(items ?? []);
      setLoadError(false);
    };
    void refresh();
    const channel = supabase.channel(`notifications-${userId}`)
      .on("postgres_changes", { event: "*", schema: "public", table: "notifications", filter: `recipient_id=eq.${userId}` }, () => { void refresh(); })
      .subscribe((status) => { if (status === "SUBSCRIBED") void refresh(); });
    const onReconnect = () => { void refresh(); };
    const onVisibility = () => { if (document.visibilityState === "visible") void refresh(); };
    window.addEventListener("online", onReconnect);
    document.addEventListener("visibilitychange", onVisibility);
    const poll = window.setInterval(onVisibility, 60_000);
    return () => {
      mounted = false;
      window.clearInterval(poll);
      window.removeEventListener("online", onReconnect);
      document.removeEventListener("visibilitychange", onVisibility);
      void supabase.removeChannel(channel);
    };
  }, [userId]);

  const closeMenu = (event: React.MouseEvent<HTMLAnchorElement>) => event.currentTarget.closest("details")?.removeAttribute("open");
  return <details data-header-menu="notifications" className="relative">
    <summary aria-label={`Notifications${unreadCount ? `, ${unreadCount} unread` : ""}`} className="relative grid size-10 cursor-pointer list-none place-items-center rounded-lg text-slate-600 hover:bg-slate-100 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-cyan-600 [&::-webkit-details-marker]:hidden">
      <HugeiconsIcon icon={Notification01Icon} size={20} />
      {unreadCount > 0 && <span className="absolute -right-0.5 -top-0.5 min-w-4 rounded-full bg-cyan-600 px-1 text-center text-[10px] font-semibold leading-4 text-white">{unreadCount > 99 ? "99+" : unreadCount}</span>}
    </summary>
    <div className="fixed inset-x-3 top-16 z-50 max-h-[calc(100svh-5rem)] overflow-hidden rounded-xl border border-slate-200 bg-white shadow-xl sm:absolute sm:inset-x-auto sm:right-0 sm:top-auto sm:mt-2 sm:w-[350px]">
      <div className="grid grid-cols-[1fr_auto] items-center gap-x-2 border-b border-slate-100 px-4 py-3">
        <h2 className="text-lg font-semibold">Notifications</h2>
        <button type="button" aria-label="Close notifications" onClick={(event) => event.currentTarget.closest("details")?.removeAttribute("open")} className="grid size-8 place-items-center rounded-full text-slate-500 hover:bg-slate-100"><HugeiconsIcon icon={Cancel01Icon} size={17} /></button>
        {recent.some((item) => item.read_at) && <div className="col-span-2 mt-1"><MarkAllNotificationsUnread compact /></div>}
      </div>
      {loadError ? <p role="status" className="p-4 text-xs text-amber-700">Updates are temporarily unavailable. Open the notification center to retry.</p>
        : recent.length === 0 ? <EmptyState kind="notifications" compact title="No notifications yet" />
          : <ul className="max-h-[calc(100svh-11rem)] divide-y divide-slate-100 overflow-auto sm:max-h-80">{recent.map((item) => <li key={item.id}><Link href={`/notifications/${item.id}`} onClick={closeMenu} className={`block px-4 py-3 hover:bg-slate-50 ${item.read_at ? "" : "bg-cyan-50/50"}`}><span className="block text-sm font-semibold">{item.title}</span><span className="mt-1 block line-clamp-2 text-xs leading-5 text-slate-600">{item.message}</span></Link></li>)}</ul>}
      <Link href="/notifications" onClick={closeMenu} className="block border-t border-slate-100 px-4 py-3 text-xs font-semibold text-cyan-700 hover:bg-slate-50">View all notifications</Link>
    </div>
  </details>;
}
