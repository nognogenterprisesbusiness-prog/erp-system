"use client";
import { useEffect, useRef, useState, useTransition } from "react";
import { searchReferenceChoices, type ReferenceChoice } from "@/app/(workspace)/references/actions";
import { SelectPicker } from "./select-picker";
import { Button } from "./button";
import { fieldControlClass } from "./form-field";
export function PagedReferencePicker({ kind, projectId = "", warehouseId = "", label, value, onValueChange, initialOptions, disabledValues = [], onPick }: { kind: "material" | "attendance" | "site_material" | "request_material"; projectId?: string; warehouseId?: string; label: string; value: string; onValueChange: (value: string) => void; initialOptions: ReferenceChoice[]; disabledValues?: string[]; onPick?: (choice: ReferenceChoice) => void }) {
  const [search, setSearch] = useState("");
  const [page, setPage] = useState(1);
  const [activeSearch, setActiveSearch] = useState(kind === "request_material");
  const [result, setResult] = useState<{ choices: ReferenceChoice[]; count: number }>({ choices: initialOptions, count: initialOptions.length });
  const [selected, setSelected] = useState<ReferenceChoice | undefined>(initialOptions.find((o) => o.value === value));
  const [message, setMessage] = useState("");
  const [pending, startTransition] = useTransition();
  const cache = useRef(new Map<string, typeof result>());
  useEffect(() => {
    if (!activeSearch) return;
    let active = true;
    const key = `${kind}:${projectId}:${warehouseId}:${search}:${page}`;
    const timer = setTimeout(() => startTransition(async () => {
      try {
        const next = cache.current.get(key) ?? await searchReferenceChoices(kind, projectId, search, page, warehouseId);
        if (active) { cache.current.set(key, next); setResult(next); setMessage(""); }
      } catch { if (active) setMessage("Could not load choices. Change the search to retry."); }
    }), 300);
    return () => { active = false; clearTimeout(timer); };
  }, [kind, projectId, warehouseId, search, page, activeSearch]);
  const options = [...result.choices];
  if (value && !options.some((o) => o.value === value)) options.unshift(selected?.value === value ? selected : { value, label: "Selected record" });
  return <div className="space-y-2" onFocusCapture={() => setActiveSearch(true)}><input className={fieldControlClass} type="search" aria-label={`Search ${label}`} placeholder={`Search ${label.toLowerCase()}`} value={search} maxLength={100} onChange={(e) => { setActiveSearch(true); setSearch(e.target.value); setPage(1); }} /><SelectPicker label={label} value={value} onValueChange={(id) => { const item = options.find((o) => o.value === id); setSelected(item); if (item) onPick?.(item); onValueChange(id); }} options={options.map((o) => ({ ...o, disabled: disabledValues.includes(o.value) }))} /><div className="flex items-center gap-2 text-xs text-slate-500">{pending ? <span role="status">Loading choices…</span> : <span>{activeSearch ? `${result.count} matches` : "Search to find more records"}</span>}{page > 1 && <Button type="button" size="sm" variant="ghost" disabled={pending} onClick={() => setPage((p) => p - 1)}>Previous</Button>}{page * 20 < result.count && <Button type="button" size="sm" variant="ghost" disabled={pending} onClick={() => setPage((p) => p + 1)}>Next</Button>}</div>{message && <p role="alert" className="text-xs text-red-700">{message}</p>}</div>;
}
