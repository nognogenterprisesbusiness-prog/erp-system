"use client";

import { startTransition, useEffect, useRef } from "react";
import { usePathname, useRouter } from "next/navigation";
import { createClient } from "@/lib/supabase/browser";
import { liveTablesForPath, refreshIntervalForPath } from "@/lib/realtime/route-sources";

const routeCacheMs = 120_000;
const backgroundStaleMs = 30_000;

export function LiveRouteRefresh({ userId }: { userId: string }) {
  const pathname = usePathname();
  const router = useRouter();
  const visits = useRef(new Map<string, number>());

  useEffect(() => {
    const tables = liveTablesForPath(pathname);
    const interval = refreshIntervalForPath(pathname);
    const previousVisit = visits.current.get(pathname);
    const age = previousVisit === undefined ? Infinity : Date.now() - previousVisit;
    // An expired/unseen route is already fetching its page during navigation.
    let lastRefresh = age >= routeCacheMs ? Date.now() : previousVisit!;
    visits.current.set(pathname, lastRefresh);
    if (visits.current.size > 100) {
      const oldest = visits.current.keys().next().value;
      if (oldest !== undefined) visits.current.delete(oldest);
    }
    let disposed = false;
    let connected = false;
    let subscribedBefore = false;
    let pendingDeferred = false;
    let debounce: ReturnType<typeof setTimeout> | undefined;

    const refresh = () => {
      if (disposed) return;
      if (document.visibilityState !== "visible" || document.querySelector("dialog[open]")) {
        pendingDeferred = true;
        return;
      }
      pendingDeferred = false;
      lastRefresh = Date.now();
      visits.current.set(pathname, lastRefresh);
      // Keep the current page visible while the new server data arrives.
      startTransition(() => router.refresh());
    };
    const scheduleRefresh = () => {
      if (disposed) return;
      clearTimeout(debounce);
      debounce = setTimeout(refresh, 400);
    };
    const refreshIfStale = () => {
      if (pendingDeferred || Date.now() - lastRefresh >= (interval ?? routeCacheMs)) scheduleRefresh();
    };
    const onVisibility = () => { if (document.visibilityState === "visible") refreshIfStale(); };
    const onOnline = () => scheduleRefresh();
    const onDialogClose = () => { if (pendingDeferred) scheduleRefresh(); };
    document.addEventListener("visibilitychange", onVisibility);
    document.addEventListener("close", onDialogClose, true);
    window.addEventListener("online", onOnline);
    // Realtime handles connected operational pages. Poll only as a fallback;
    // analytics have no channel and retain their periodic refresh.
    const poll = interval ? window.setInterval(() => {
      if (!tables.length || !connected || pendingDeferred) refreshIfStale();
    }, interval) : undefined;
    if (age >= backgroundStaleMs && age < routeCacheMs) scheduleRefresh();

    const supabase = tables.length ? createClient() : null;
    const channel = supabase?.channel(`workspace-live-${userId}-${pathname}`);
    for (const table of tables) {
      channel?.on("postgres_changes", {
        event: "*", schema: "public", table,
        ...(table === "notifications" ? { filter: `recipient_id=eq.${userId}` } : {}),
      }, scheduleRefresh);
    }
    channel?.subscribe((status) => {
      connected = status === "SUBSCRIBED";
      if (connected) {
        if (subscribedBefore) scheduleRefresh();
        subscribedBefore = true;
      }
    });

    return () => {
      disposed = true;
      clearTimeout(debounce);
      if (poll !== undefined) window.clearInterval(poll);
      document.removeEventListener("visibilitychange", onVisibility);
      document.removeEventListener("close", onDialogClose, true);
      window.removeEventListener("online", onOnline);
      if (channel && supabase) void supabase.removeChannel(channel);
    };
  }, [pathname, router, userId]);

  return null;
}
