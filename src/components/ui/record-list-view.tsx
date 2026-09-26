"use client";

import { useCallback, useSyncExternalStore, type ReactNode } from "react";

type ViewMode = "cards" | "table";
const changeEvent = "erp:list-view-changed";
const preferences = new Map<string, ViewMode>();
function subscribe(listener: () => void) {
  window.addEventListener("storage", listener);
  window.addEventListener(changeEvent, listener);
  return () => { window.removeEventListener("storage", listener); window.removeEventListener(changeEvent, listener); };
}

function useRecordView(storageKey: string) {
  const key = `erp:list-view:${storageKey}`;
  const snapshot = useCallback((): ViewMode => {
    if (preferences.has(key)) return preferences.get(key)!;
    try { return window.localStorage.getItem(key) === "table" ? "table" : "cards"; } catch { return "cards"; }
  }, [key]);
  const mode = useSyncExternalStore(subscribe, snapshot, () => "cards" as ViewMode);
  function select(value: ViewMode) {
    preferences.set(key, value);
    try { window.localStorage.setItem(key, value); } catch { /* Switching still works when browser storage is unavailable. */ }
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
  return <>
    {mode === "cards" || !rows.length ? children : <div className="mt-5 overflow-hidden rounded-2xl border border-slate-200 bg-white"><div className="overflow-x-auto"><table className="w-full text-left text-sm"><caption className="sr-only">{title}</caption><thead className="bg-slate-50 text-xs font-medium text-slate-500"><tr>{columns.map((column) => <th key={column} scope="col" className="whitespace-nowrap px-5 py-3">{column}</th>)}</tr></thead><tbody className="divide-y divide-slate-100">{rows.map((row) => <tr key={row.id} className="hover:bg-slate-50/60">{row.cells.map((cell, index) => <td key={index} className="px-5 py-4 align-middle">{cell}</td>)}</tr>)}</tbody></table></div></div>}
  </>;
}
