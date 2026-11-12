"use client";

import { useActionState, useEffect, useState } from "react";
import { assignDriverTruck, searchAssignableTrucks } from "./asset-expense-actions";
import { SelectPicker } from "@/components/ui/select-picker";
import { RecordFormControls } from "@/components/ui/record-create-dialog";
import { fieldControlClass } from "@/components/ui/form-field";

export type AssignedTruck = { id: string; label: string };

export function DriverAssignmentForm({ driverId, current }: { driverId: string; current?: AssignedTruck }) {
  const [state, action, pending] = useActionState(assignDriverTruck, { message: "" });
  const [selection, setSelection] = useState<AssignedTruck | undefined>(current);
  const [search, setSearch] = useState("");
  const [result, setResult] = useState<{ options: AssignedTruck[]; loading: boolean; message?: string }>({ options: [], loading: true });
  useEffect(() => {
    let active = true;
    const timer = setTimeout(() => {
      searchAssignableTrucks(search).then(next => {
        if (active) setResult({ ...next, loading: false });
      }).catch(() => { if (active) setResult({ options: [], loading: false, message: "Could not load trucks. Change the search to retry." }); });
    }, search ? 250 : 0);
    return () => { active = false; clearTimeout(timer); };
  }, [search]);
  const options = new Map(result.options.map(truck => [truck.id, truck]));
  if (current) options.set(current.id, current);
  if (selection) options.set(selection.id, selection);
  return <form action={action} className="grid gap-4">
    <input type="hidden" name="driverId" value={driverId} />
    <p className="rounded-lg bg-slate-50 p-3 text-sm leading-6 text-slate-600">Current truck: <span className="font-semibold text-slate-800">{current?.label ?? "No truck assigned"}</span>. Saving a new truck changes this driver’s assignment only.</p>
    <label className="grid gap-2 text-sm font-medium">Find a truck<input type="search" maxLength={80} value={search} disabled={pending} placeholder="Search truck name or code" className={fieldControlClass} onChange={event => { setSearch(event.target.value); setResult(previous => ({ ...previous, loading: true, message: undefined })); }} /></label>
    <label className="grid gap-2 text-sm font-medium">Assigned truck<SelectPicker label="Assigned truck" value={selection?.id ?? "none"} onValueChange={value => setSelection(value === "none" ? undefined : options.get(value))} disabled={pending || result.loading} options={[{ value: "none", label: "No truck assigned" }, ...[...options.values()].map(truck => ({ value: truck.id, label: truck.label }))]} /></label>
    <input type="hidden" name="assetId" value={selection?.id ?? ""} />
    {result.loading ? <p role="status" className="text-sm text-slate-500">Loading trucks…</p> : result.message ? <p role="alert" className="text-sm text-red-700">{result.message}</p> : <p className="text-xs text-slate-500">{result.options.length ? "Choose a truck, or choose No truck assigned to remove this assignment. Search to find more trucks." : "No matching active trucks. Change the search, or choose No truck assigned."}</p>}
    {state.message && <p role={state.success ? "status" : "alert"} className={`text-sm ${state.success ? "text-emerald-700" : "text-red-700"}`}>{state.message}</p>}
    <RecordFormControls busy={pending} success={state.success} disabled={result.loading || selection?.id === current?.id} label="Save assignment" />
  </form>;
}
