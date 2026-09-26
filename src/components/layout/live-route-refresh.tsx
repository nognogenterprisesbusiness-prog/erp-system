"use client";

import { useEffect } from "react";
import { usePathname, useRouter } from "next/navigation";
import { createClient } from "@/lib/supabase/browser";
import { liveTablesForPath, refreshIntervalForPath } from "@/lib/realtime/route-sources";

export function LiveRouteRefresh({ userId }: { userId: string }) {
  const pathname = usePathname();
  const router = useRouter();

  useEffect(() => {
    const tables = liveTablesForPath(pathname);
    const interval = refreshIntervalForPath(pathname);
    if (!interval) return;

    let disposed = false;
    let connected = false;
    let lastRefresh = Date.now();
    let pendingWhileHidden = false;
    let debounce: ReturnType<typeof setTimeout> | undefined;
    const refresh = () => {
      if (disposed) return;
      if (document.visibilityState !== "visible") { pendingWhileHidden = true; return; }
      pendingWhileHidden = false;
      lastRefresh = Date.now();
      router.refresh();
    };
    const scheduleRefresh = () => {
      if (disposed) return;
      if (debounce) clearTimeout(debounce);
      debounce = setTimeout(refresh, 400);
    };
    const refreshIfStale = () => {
      if (pendingWhileHidden || Date.now() - lastRefresh >= interval) scheduleRefresh();
    };
    const onVisibility = () => { if (document.visibilityState === "visible") refreshIfStale(); };
    const onOnline = () => scheduleRefresh();
    document.addEventListener("visibilitychange", onVisibility);
    window.addEventListener("online", onOnline);
    const poll = window.setInterval(refreshIfStale, interval);

    const supabase = tables.length ? createClient() : null;
    const channel = supabase?.channel(`workspace-live-${userId}-${pathname}`);
    for (const table of tables) {
      channel?.on("postgres_changes", {
        event: "*", schema: "public", table,
        ...(table === "notifications" ? { filter: `recipient_id=eq.${userId}` } : {}),
      }, scheduleRefresh);
    }
    channel?.subscribe((status) => {
      if (status === "SUBSCRIBED") {
        if (connected) scheduleRefresh();
        connected = true;
      }
    });

    return () => {
      disposed = true;
      if (debounce) clearTimeout(debounce);
      window.clearInterval(poll);
      document.removeEventListener("visibilitychange", onVisibility);
      window.removeEventListener("online", onOnline);
      if (channel && supabase) void supabase.removeChannel(channel);
    };
  }, [pathname, router, userId]);

  return null;
}
