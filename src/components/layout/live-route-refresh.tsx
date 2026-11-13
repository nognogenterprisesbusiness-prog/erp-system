"use client";

import { startTransition, useEffect, useRef } from "react";
import { usePathname, useRouter, useSearchParams } from "next/navigation";
import { createClient } from "@/lib/supabase/browser";
import { liveTablesForPath, refreshIntervalForPath } from "@/lib/realtime/route-sources";
import { ROUTE_CACHE_MS as routeCacheMs, markOtherRoutesStale, shouldDeferRouteRefresh, shouldRefreshCachedRoute } from "@/lib/realtime/navigation-cache";
import { FormDrafts, formSnapshot } from "@/lib/realtime/form-drafts";

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
    const routeVisits = visits.current;
    const previousVisit = routeVisits.get(routeKey);
    const age = previousVisit === undefined ? Infinity : Date.now() - previousVisit;
    // An expired/unseen route is already fetching its page during navigation.
    let lastRefresh = age >= routeCacheMs ? Date.now() : previousVisit!;
    routeVisits.set(routeKey, lastRefresh);
    if (routeVisits.size > 100) {
      const oldest = routeVisits.keys().next().value;
      if (oldest !== undefined) routeVisits.delete(oldest);
    }
    let disposed = false;
    let connected = false;
    let subscribedBefore = false;
    let pendingDeferred = false;
    let debounce: ReturnType<typeof setTimeout> | undefined;
    const drafts = new FormDrafts<HTMLFormElement>();
    for (const form of document.forms) drafts.observe(form, formSnapshot(form));
    const formOf = (event: Event) => event.target instanceof Element ? event.target.closest("form") : null;
    const observeForm = (event: Event) => { const form = formOf(event); if (form) drafts.observe(form, formSnapshot(form)); };
    const touchForm = (event: Event) => {
      const form = formOf(event);
      if (form) drafts.touch(form, formSnapshot(form));
      if (pendingDeferred) scheduleRefresh();
    };
    const onFormSaved = (event: Event) => {
      const form = formOf(event);
      if (form) drafts.saved(form, formSnapshot(form));
      if (pendingDeferred) scheduleRefresh();
    };

    const refresh = () => {
      if (disposed) return;
      if (shouldDeferRouteRefresh({
        visible: document.visibilityState === "visible",
        online: navigator.onLine,
        editingDialogOpen: !!document.querySelector('dialog[open]:not([data-record-detail-panel])'),
        submissionPending: !!document.querySelector('form[aria-busy="true"], form [aria-busy="true"]'),
        unsavedChanges: drafts.hasChanges(new Map(Array.from(document.forms, form => [form, formSnapshot(form)]))),
      })) {
        pendingDeferred = true;
        return;
      }
      pendingDeferred = false;
      lastRefresh = Date.now();
      routeVisits.set(routeKey, lastRefresh);
      // Keep the current page visible while the new server data arrives.
      startTransition(() => router.refresh());
    };
    const scheduleRefresh = () => {
      if (disposed || debounce !== undefined) return;
      // A fixed window cannot be postponed forever by a busy warehouse.
      const delay = Math.max(400, 2_000 - (Date.now() - lastRefresh));
      debounce = setTimeout(() => { debounce = undefined; refresh(); }, delay);
    };
    const refreshIfStale = () => {
      if (pendingDeferred || Date.now() - lastRefresh >= (interval ?? routeCacheMs)) scheduleRefresh();
    };
    const onVisibility = () => { if (document.visibilityState === "visible") refreshIfStale(); };
    const onOnline = () => scheduleRefresh();
    const onDialogClose = () => { if (pendingDeferred) scheduleRefresh(); };
    const formStructure = new MutationObserver(() => { if (pendingDeferred) scheduleRefresh(); });
    formStructure.observe(document.body, { childList: true, subtree: true });
    const onRecordsSaved = () => {
      // The Server Action revalidates the active page. Mark other cached
      // destinations stale so they refresh when visited again.
      const now = Date.now();
      markOtherRoutesStale(routeVisits, routeKey, now);
      lastRefresh = now;
      pendingDeferred = false;
      clearTimeout(debounce);
      debounce = undefined;
    };
    document.addEventListener("visibilitychange", onVisibility);
    document.addEventListener("close", onDialogClose, true);
    document.addEventListener("focusin", observeForm, true);
    document.addEventListener("pointerdown", touchForm, true);
    document.addEventListener("input", touchForm, true);
    document.addEventListener("change", touchForm, true);
    document.addEventListener("erp:form-saved", onFormSaved, true);
    window.addEventListener("online", onOnline);
    window.addEventListener("erp:records-saved", onRecordsSaved);
    // Some project cost tables are intentionally Admin-only under RLS. Other roles
    // must still see safe derived views refresh when those rows change.
    const poll = interval ? window.setInterval(() => {
      // A healthy channel can still miss a permission loss or a deleted row.
      // Reconcile at a bounded interval while visible, online and not editing.
      refreshIfStale();
    }, interval) : undefined;
    if (shouldRefreshCachedRoute(previousVisit, Date.now())) scheduleRefresh();

    const supabase = tables.length ? createClient() : null;
    const channel = supabase?.channel(`workspace-live-${userId}-${routeKey}`);
    for (const table of tables) {
      channel?.on("postgres_changes", {
        event: "*", schema: "public", table,
        ...(["notifications", "live_refresh_signals"].includes(table) ? { filter: `recipient_id=eq.${userId}` } : {}),
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
      if (pendingDeferred) markOtherRoutesStale(routeVisits, routeKey, Date.now());
      clearTimeout(debounce);
      formStructure.disconnect();
      if (poll !== undefined) window.clearInterval(poll);
      document.removeEventListener("visibilitychange", onVisibility);
      document.removeEventListener("close", onDialogClose, true);
      document.removeEventListener("focusin", observeForm, true);
      document.removeEventListener("pointerdown", touchForm, true);
      document.removeEventListener("input", touchForm, true);
      document.removeEventListener("change", touchForm, true);
      document.removeEventListener("erp:form-saved", onFormSaved, true);
      window.removeEventListener("online", onOnline);
      window.removeEventListener("erp:records-saved", onRecordsSaved);
      if (channel && supabase) void supabase.removeChannel(channel);
    };
  }, [pathname, requestType, routeKey, router, userId]);

  return null;
}
