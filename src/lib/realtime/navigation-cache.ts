export const ROUTE_CACHE_MS = 600_000;
export const BACKGROUND_STALE_MS = 30_000;

export function shouldDeferRouteRefresh({ visible, editingDialogOpen, submissionPending, unsavedChanges = false, online = true }: { visible: boolean; editingDialogOpen: boolean; submissionPending: boolean; unsavedChanges?: boolean; online?: boolean }) {
  return !visible || !online || editingDialogOpen || submissionPending || unsavedChanges;
}

export function shouldRefreshCachedRoute(lastVisit: number | undefined, now: number) {
  if (lastVisit === undefined) return false;
  const age = now - lastVisit;
  return age >= BACKGROUND_STALE_MS && age < ROUTE_CACHE_MS;
}

export function markOtherRoutesStale(visits: Map<string, number>, currentPath: string, now: number) {
  for (const path of visits.keys()) visits.set(path, path === currentPath ? now : now - BACKGROUND_STALE_MS);
}
