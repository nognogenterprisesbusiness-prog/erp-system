"use client";
import { useEffect, useState } from "react";
import { searchReferenceChoices, type ReferenceChoice, type ReferenceKind } from "@/app/(workspace)/references/actions";
import { SelectPicker } from "./select-picker";
import { Button } from "./button";
import { fieldControlClass } from "./form-field";

type Props = { kind: ReferenceKind; projectId?: string; warehouseId?: string; label: string; value: string; onValueChange: (value: string) => void; initialOptions: ReferenceChoice[]; disabledValues?: string[]; onPick?: (choice: ReferenceChoice) => void };
export function PagedReferencePicker(props: Props) {
  // A project/warehouse change starts a new search session; old results cannot be selected.
  return <ReferenceSearch key={`${props.kind}:${props.projectId ?? ""}:${props.warehouseId ?? ""}`} {...props} />;
}
function ReferenceSearch({ kind, projectId = "", warehouseId = "", label, value, onValueChange, initialOptions, disabledValues = [], onPick }: Props) {
  const [search, setSearch] = useState("");
  const [page, setPage] = useState(1);
  const [retry, setRetry] = useState(0);
  const queryKey = JSON.stringify([search, page, retry]);
  const [result, setResult] = useState<{ key: string; choices: ReferenceChoice[]; count: number; message: string }>({ key: "", choices: initialOptions, count: initialOptions.length, message: "" });
  const [selected, setSelected] = useState<ReferenceChoice>();
  const pending = result.key !== queryKey;
  useEffect(() => {
    let active = true;
    const timer = setTimeout(async () => {
      try {
        const next = await searchReferenceChoices(kind, projectId, search, page, warehouseId);
        if (active) setResult({ ...next, key: queryKey, message: "" });
      } catch {
        if (active) setResult({ key: queryKey, choices: [], count: 0, message: "Could not load choices. Retry your search." });
      }
    }, 300);
    return () => { active = false; clearTimeout(timer); };
  }, [kind, projectId, warehouseId, search, page, queryKey]);
  const current = selected?.value === value ? selected : initialOptions.find((item) => item.value === value) ?? result.choices.find((item) => item.value === value);
  const options = pending ? [] : [...result.choices];
  if (current && !options.some((item) => item.value === current.value)) options.unshift(current);
  return <div className="space-y-2">
    <input className={fieldControlClass} type="search" aria-label={`Search ${label}`} placeholder={`Search ${label.toLowerCase()}`} value={search} maxLength={100} onChange={(event) => { setSearch(event.target.value); setPage(1); }} />
    <SelectPicker label={label} value={value} disabled={pending} onValueChange={(id) => {
      const item = options.find((option) => option.value === id);
      if (!item) return;
      setSelected(item); onPick?.(item); onValueChange(id);
    }} options={options.map((option) => ({ ...option, disabled: disabledValues.includes(option.value) }))} />
    <div className="flex items-center gap-2 text-xs text-slate-500">
      {pending ? <span role="status">Loading choices…</span> : <span>{result.count} matches</span>}
      {page > 1 && <Button type="button" size="sm" variant="ghost" disabled={pending} onClick={() => setPage((previous) => previous - 1)}>Previous</Button>}
      {!pending && page * 20 < result.count && <Button type="button" size="sm" variant="ghost" onClick={() => setPage((previous) => previous + 1)}>Next</Button>}
    </div>
    {!pending && result.message && <div role="alert" className="text-xs text-red-700">{result.message}<Button type="button" size="sm" variant="ghost" onClick={() => setRetry((previous) => previous + 1)}>Retry</Button></div>}
  </div>;
}
