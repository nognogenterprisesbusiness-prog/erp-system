"use client";

import { useEffect, useState } from "react";
import { Button } from "./button";
import { z } from "zod";
import { SelectPicker, type SelectOption } from "./select-picker";
import type { SelectPickerProps } from "./select-picker";

const responseSchema = z.object({ choices: z.array(z.object({ value: z.string(), label: z.string(), secondary: z.string().optional() })), count: z.number().nonnegative() });
type Props = Omit<SelectPickerProps, "options" | "searchable" | "onSearchChange" | "loading" | "selectedOption" | "resultCount" | "page" | "onPageChange"> & { kind: "asset_location" | "profile" | "project" | "employee" | "site"; projectId?: string; initialOption?: SelectOption; emptyOption?: SelectOption };

export function RemoteSelectPicker(props: Props) {
  return <RemoteChoices key={`${props.kind}:${props.projectId ?? ""}`} {...props} />;
}
function RemoteChoices({ kind, projectId, initialOption, emptyOption, value, defaultValue, onValueChange, ...props }: Props) {
  const [local, setLocal] = useState(defaultValue ?? "");
  const selectedId = value ?? local;
  const [selectionError, setSelectionError] = useState("");
  const [selected, setSelected] = useState(initialOption);
  const [search, setSearch] = useState("");
  const [page, setPage] = useState(1);
  const [requested, setRequested] = useState(false);
  const [retry, setRetry] = useState(0);
  const key = JSON.stringify([kind, projectId, search, page, retry]);
  const [result, setResult] = useState<{ key: string; choices: SelectOption[]; count: number; error: string }>({ key: "", choices: [], count: 0, error: "" });
  const pending = requested && result.key !== key;
  useEffect(() => {
    if (!selectedId || selectedId === emptyOption?.value || selected?.value === selectedId || initialOption?.value === selectedId) return;
    const controller = new AbortController();
    const params = new URLSearchParams({ kind, selected: selectedId });
    if (projectId) params.set("project", projectId);
    fetch(`/api/reference-choices?${params}`, { signal: controller.signal }).then(async response => {
      if (!response.ok) throw new Error();
      const data = responseSchema.parse(await response.json());
      if (!controller.signal.aborted) { if (data.choices[0]) { setSelected(data.choices[0]); setSelectionError(""); } else setSelectionError("This record is unavailable. Choose another record."); }
    }).catch(() => { if (!controller.signal.aborted) setSelectionError("The saved selection could not be loaded. Search to choose a record."); });
    return () => controller.abort();
  }, [kind, projectId, selectedId, selected, initialOption, emptyOption?.value]);
  useEffect(() => {
    if (!requested) return;
    const controller = new AbortController();
    const timer = setTimeout(async () => {
      try {
        const params = new URLSearchParams({ kind, q: search, page: String(page) });
        if (projectId) params.set("project", projectId);
        const response = await fetch(`/api/reference-choices?${params}`, { signal: controller.signal });
        if (!response.ok) throw new Error();
        const data = responseSchema.parse(await response.json());
        if (!controller.signal.aborted) setResult({ ...data, key, error: "" });
      } catch {
        if (!controller.signal.aborted) setResult({ key, choices: [], count: 0, error: "Choices could not be loaded." });
      }
    }, 250);
    return () => { clearTimeout(timer); controller.abort(); };
  }, [kind, projectId, search, page, key, requested]);
  const current = emptyOption?.value === selectedId ? emptyOption : initialOption?.value === selectedId ? initialOption : selected?.value === selectedId ? selected : selectedId ? { value: selectedId, label: "Selected record" } : undefined;
  return <div data-reference-select className="min-w-0 w-full"><SelectPicker {...props} searchable value={selectedId} selectedOption={current} options={[...(emptyOption ? [emptyOption] : []), ...(pending ? [] : result.choices)]} loading={pending} resultCount={result.count} page={page} onPageChange={setPage} onSearchChange={query => { setRequested(true); setSearch(query); setPage(1); }} onValueChange={id => { const option = id === emptyOption?.value ? emptyOption : result.choices.find(item => item.value === id); if (!option) return; setSelected(option); setSelectionError(""); setLocal(id); onValueChange?.(id); }} />{selectionError && <p role="alert" className="mt-1 text-xs text-red-700">{selectionError}</p>}{result.error && !pending && <div role="alert" className="mt-1 text-xs text-red-700">{result.error} <Button type="button" size="sm" variant="outline" onClick={() => setRetry(number => number + 1)}>Retry</Button></div>}</div>;
}
