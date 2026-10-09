"use client";

import { createContext, useCallback, useContext, useEffect, useSyncExternalStore, type ReactNode } from "react";
import { TableSkeleton } from "@/components/ui/table-skeleton";
import { parseRecordViewPreferences, recordViewCookie, updateRecordViewPreferences, type RecordViewMode, type RecordViewPreferences } from "@/lib/ui/record-view-preferences";

type ViewMode = RecordViewMode;
const changeEvent = "erp:list-view-changed";
const preferences = new Map<string, ViewMode>();
const RecordViewContext = createContext<RecordViewPreferences>({});

export function RecordListViewProvider({ initialPreferences, children }: { initialPreferences: RecordViewPreferences; children?: ReactNode }) {
  return <RecordViewContext.Provider value={initialPreferences}>{children}</RecordViewContext.Provider>;
}

function subscribe(listener: () => void) {
  const onStorage = (event: StorageEvent) => {
    if (event.key === null) preferences.clear();
    else if (event.key.startsWith("erp:list-view:")) preferences.delete(event.key);
    listener();
  };
  window.addEventListener("storage", onStorage);
  window.addEventListener(changeEvent, listener);
  return () => { window.removeEventListener("storage", onStorage); window.removeEventListener(changeEvent, listener); };
}

function persistView(storageKey: string, mode: ViewMode) {
  try {
    const current = document.cookie.split("; ").find((part) => part.startsWith(`${recordViewCookie}=`))?.slice(recordViewCookie.length + 1);
    if (parseRecordViewPreferences(current)[storageKey] === mode) return;
    document.cookie = `${recordViewCookie}=${updateRecordViewPreferences(current, storageKey, mode)}; Path=/; Max-Age=31536000; SameSite=Lax${window.location.protocol === "https:" ? "; Secure" : ""}`;
  } catch { /* Browsers may block preference storage; the current view still works. */ }
}

function useRecordView(storageKey: string) {
  const key = `erp:list-view:${storageKey}`;
  const initialMode = useContext(RecordViewContext)[storageKey];
  const snapshot = useCallback((): ViewMode => {
    if (preferences.has(key)) return preferences.get(key)!;
    try {
      const saved = window.localStorage.getItem(key);
      return saved === "table" || saved === "cards" ? saved : initialMode ?? "cards";
    } catch { return initialMode ?? "cards"; }
  }, [key, initialMode]);
  const serverSnapshot = useCallback(() => initialMode, [initialMode]);
  const mode = useSyncExternalStore<ViewMode | undefined>(subscribe, snapshot, serverSnapshot);
  useEffect(() => { if (mode) persistView(storageKey, mode); }, [storageKey, mode]);
  function select(value: ViewMode) {
    preferences.set(key, value);
    try { window.localStorage.setItem(key, value); } catch { /* Switching still works when browser storage is unavailable. */ }
    persistView(storageKey, value);
    window.dispatchEvent(new Event(changeEvent));
  }
  return { mode, select };
}

export function RecordListViewToggle({ storageKey, title }: { storageKey: string; title: string }) {
  const { mode, select } = useRecordView(storageKey);
  return <div className="shrink-0 sm:ml-auto"><div role="group" aria-label={`${title} view`} className="inline-flex gap-1 rounded-xl border border-slate-200 bg-white p-1">{(["cards", "table"] as const).map((value) => <button key={value} type="button" aria-pressed={mode === value} onClick={() => select(value)} className={`rounded-lg px-3 py-1.5 text-sm font-medium focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-cyan-600 ${mode === value ? "bg-slate-900 text-white" : "text-slate-500 hover:bg-slate-100"}`}>{value === "cards" ? "Cards" : "Table"}</button>)}</div></div>;
}

export function RecordListView({ storageKey, title, columns, rows, children }: { storageKey: string; title: string; columns: string[]; rows: { id: string; cells: ReactNode[] }[]; children?: ReactNode }) {
  const { mode } = useRecordView(storageKey);
  if (!mode && rows.length) return <RecordViewLoading />;
  return <>
    {mode === "cards" || !rows.length ? children : <div className="mt-5 overflow-hidden rounded-2xl border border-slate-200 bg-white"><div className="overflow-x-auto"><table className="w-full text-left text-sm"><caption className="sr-only">{title}</caption><thead className="bg-slate-50 text-xs font-medium text-slate-500"><tr>{columns.map((column) => <th key={column} scope="col" className="whitespace-nowrap px-5 py-3">{column}</th>)}</tr></thead><tbody className="divide-y divide-slate-100">{rows.map((row) => <tr key={row.id} className="hover:bg-slate-50/60">{row.cells.map((cell, index) => <td key={index} className="px-5 py-4 align-middle">{cell}</td>)}</tr>)}</tbody></table></div></div>}
  </>;
}

export function RecordListSkeleton({ storageKey, columns = 6, rows = 6 }: { storageKey: string; columns?: number; rows?: number }) {
  const { mode } = useRecordView(storageKey);
  if (!mode) return <RecordViewLoading />;
  if (mode === "table") return <TableSkeleton columns={columns} rows={rows} filters={0} />;
  return <div role="status" aria-live="polite" className="mt-5 grid gap-4 md:grid-cols-2 xl:grid-cols-3"><span className="sr-only">Loading records</span>{Array.from({ length: rows }, (_, index) => <div key={index} aria-hidden className="h-64 animate-pulse rounded-2xl border border-slate-200 bg-white p-5 motion-reduce:animate-none"><div className="h-28 rounded-lg bg-slate-100" /><div className="mt-4 h-4 w-3/4 rounded-full bg-slate-100" /><div className="mt-3 h-3 w-1/2 rounded-full bg-slate-100" /><div className="mt-5 h-3 w-full rounded-full bg-slate-100" /></div>)}</div>;
}

function RecordViewLoading() {
  return <div role="status" aria-live="polite" className="mt-5 space-y-3">
    <span className="sr-only">Loading saved view</span>
    {[0, 1, 2].map((index) => <div key={index} aria-hidden className="h-12 animate-pulse rounded-lg bg-slate-100 motion-reduce:animate-none" />)}
  </div>;
}
