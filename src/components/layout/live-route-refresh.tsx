"use client";

import { startTransition, useEffect, useRef } from "react";
import { usePathname, useRouter, useSearchParams } from "next/navigation";
import { createClient } from "@/lib/supabase/browser";
import { liveTablesForPath, refreshIntervalForPath } from "@/lib/realtime/route-sources";
import { ROUTE_CACHE_MS as routeCacheMs, markOtherRoutesStale, shouldRefreshCachedRoute } from "@/lib/realtime/navigation-cache";

export function LiveRouteRefresh({ userId }: { userId: string }) {
  const pathname = usePathname();
  const searchParams = useSearchParams();
  const router = useRouter();
  const visits = useRef(new Map<string, number>());
  const selectedType = pathname === "/requests" ? searchParams.get("type") : null;
  const requestType = selectedType === "equipment" || selectedType === "vehicle" ? selectedType : null;
  const routeKey = requestType ? `${pathname}?type=${requestType}` : pathname;

  useEffect(() => {
    const tables = liveTablesForPath(pathname, requestType);
    const interval = refreshIntervalForPath(pathname, requestType);
    const previousVisit = visits.current.get(routeKey);
    const age = previousVisit === undefined ? Infinity : Date.now() - previousVisit;
    // An expired/unseen route is already fetching its page during navigation.
    let lastRefresh = age >= routeCacheMs ? Date.now() : previousVisit!;
    visits.current.set(routeKey, lastRefresh);
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
      visits.current.set(routeKey, lastRefresh);
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
    const onRecordsSaved = () => {
      // The saving dialog refreshes this page. Other cached destinations need
      // fresh data when revisited, without discarding their reusable screen.
      const now = Date.now();
      markOtherRoutesStale(visits.current, routeKey, now);
      lastRefresh = now;
      pendingDeferred = false;
      clearTimeout(debounce);
    };
    document.addEventListener("visibilitychange", onVisibility);
    document.addEventListener("close", onDialogClose, true);
    window.addEventListener("online", onOnline);
    window.addEventListener("erp:records-saved", onRecordsSaved);
    // Some project cost tables are intentionally Admin-only under RLS. Other roles
    // must still see safe derived views refresh when those rows change.
    const restrictedProjectView = pathname.startsWith("/projects/") || pathname === "/attendance";
    const poll = interval ? window.setInterval(() => {
      if (restrictedProjectView || !tables.length || !connected || pendingDeferred) refreshIfStale();
    }, interval) : undefined;
    if (shouldRefreshCachedRoute(previousVisit, Date.now())) scheduleRefresh();

    const supabase = tables.length ? createClient() : null;
    const channel = supabase?.channel(`workspace-live-${userId}-${routeKey}`);
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
      window.removeEventListener("erp:records-saved", onRecordsSaved);
      if (channel && supabase) void supabase.removeChannel(channel);
    };
  }, [pathname, requestType, routeKey, router, userId]);

  return null;
}
