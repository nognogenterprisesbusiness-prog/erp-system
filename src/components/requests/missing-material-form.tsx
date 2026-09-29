"use client";

import { useActionState, useEffect, useRef, useState } from "react";
import { submitMissingMaterialAction, resolveMissingMaterialAction, type MissingMaterialState } from "@/app/(workspace)/requests/missing/actions";
import { PagedReferencePicker } from "@/components/ui/paged-reference-picker";
import { Button } from "@/components/ui/button";
import { FormField, fieldControlClass } from "@/components/ui/form-field";
import { SelectPicker } from "@/components/ui/select-picker";
import { todayInManila } from "@/lib/date";
import type { getMaterialRequestChoices } from "@/lib/data/material-requests";

type Choices = Awaited<ReturnType<typeof getMaterialRequestChoices>>;
const initial: MissingMaterialState = { ok: false, message: "" };

export function MissingMaterialForm({ choices }: { choices: Choices }) {
  const [state, action, pending] = useActionState(submitMissingMaterialAction, initial);
  const [key] = useState(() => crypto.randomUUID());
  const keyInput = useRef<HTMLInputElement>(null);
  const form = useRef<HTMLFormElement>(null);
  const [projectId, setProjectId] = useState(choices.projects[0]?.id ?? "");
  const [siteId, setSiteId] = useState("");
  const [warehouseId, setWarehouseId] = useState("");
  const sites = choices.sites.filter((item) => item.project_id === projectId);
  const warehouses = choices.warehouses.filter((item) => item.project_id === projectId);
  const selectedSite = sites.some((item) => item.id === siteId) ? siteId : sites[0]?.id ?? "";
  const selectedWarehouse = warehouses.some((item) => item.warehouse_id === warehouseId) ? warehouseId : warehouses[0]?.warehouse_id ?? "";
  useEffect(() => { if (state.ok) { form.current?.reset(); if (keyInput.current) keyInput.current.value = crypto.randomUUID(); } }, [state]);
  return <form ref={form} action={action} className="grid gap-4 rounded-xl border border-slate-200 bg-white p-5 sm:grid-cols-2">
    <input ref={keyInput} type="hidden" name="key" defaultValue={key} />
    <input type="hidden" name="projectId" value={projectId} />
    <input type="hidden" name="siteId" value={selectedSite} />
    <input type="hidden" name="warehouseId" value={selectedWarehouse} />
    <FormField label="Project" htmlFor="missingProject"><SelectPicker label="Project" value={projectId} onValueChange={(id) => { setProjectId(id); setSiteId(""); setWarehouseId(""); }} options={choices.projects.map((item) => ({ value: item.id, label: item.name }))} /></FormField>
    <FormField label="Site" htmlFor="missingSite"><SelectPicker label="Site" value={selectedSite} onValueChange={setSiteId} options={sites.map((item) => ({ value: item.id, label: item.name }))} /></FormField>
    <FormField label="Source warehouse" htmlFor="missingWarehouse"><SelectPicker label="Source warehouse" value={selectedWarehouse} onValueChange={setWarehouseId} options={warehouses.map((item) => ({ value: item.warehouse_id, label: item.name }))} /></FormField>
    <FormField label="Needed by" htmlFor="missingNeeded"><input id="missingNeeded" name="neededOn" type="date" min={todayInManila()} defaultValue={todayInManila()} className={fieldControlClass} required /></FormField>
    <FormField label="Material name" htmlFor="missingName"><input id="missingName" name="name" className={fieldControlClass} maxLength={160} required /></FormField>
    <FormField label="Unit" htmlFor="missingUnit"><input id="missingUnit" name="unit" className={fieldControlClass} placeholder="bags, pieces, m³…" maxLength={40} required /></FormField>
    <FormField label="Quantity needed" htmlFor="missingQuantity"><input id="missingQuantity" name="quantity" type="number" min="0.0001" max="1000000000" step="0.0001" className={fieldControlClass} required /></FormField>
    <FormField label="Why it is needed" htmlFor="missingReason"><input id="missingReason" name="reason" className={fieldControlClass} maxLength={500} required /></FormField>
    <div className="sm:col-span-2 flex items-center justify-between gap-3">
      <p className="text-xs text-slate-500">Admin reviews this report before any material or stock is added.</p>
      <Button type="submit" disabled={pending || !selectedSite || !selectedWarehouse}>{pending ? "Sending…" : "Report missing material"}</Button>
    </div>
    {state.message && <p role={state.ok ? "status" : "alert"} className={`text-sm sm:col-span-2 ${state.ok ? "text-emerald-700" : "text-red-700"}`}>{state.message}</p>}
  </form>;
}

export function MissingMaterialResolutionForm({ id, materials }: { id: string; materials: Choices["materials"] }) {
  const [state, action, pending] = useActionState(resolveMissingMaterialAction, initial);
  const [resolution, setResolution] = useState<"resolved" | "dismissed">("resolved");
  const [materialId, setMaterialId] = useState("");
  return <form action={action} className="mt-4 grid gap-3 border-t border-slate-100 pt-4 sm:grid-cols-2">
    <input type="hidden" name="id" value={id} />
    <input type="hidden" name="action" value={resolution} />
    <input type="hidden" name="materialId" value={resolution === "resolved" ? materialId : ""} />
    <FormField label="Decision" htmlFor={`resolution-${id}`}><SelectPicker label="Decision" value={resolution} onValueChange={(value) => setResolution(value as "resolved" | "dismissed")} options={[{ value: "resolved", label: "Material stocked in warehouse" }, { value: "dismissed", label: "Dismiss with reason" }]} /></FormField>
    {resolution === "resolved" && <FormField label="Catalog material" htmlFor={`catalog-${id}`}><PagedReferencePicker kind="material" label="Catalog material" value={materialId} onValueChange={setMaterialId} initialOptions={materials.map((item) => ({ value: item.id, label: `${item.code} · ${item.name}` }))} /></FormField>}
    <FormField label="Resolution note" htmlFor={`note-${id}`} className="sm:col-span-2"><input id={`note-${id}`} name="note" className={fieldControlClass} maxLength={500} required /></FormField>
    <div className="sm:col-span-2 flex justify-end"><Button type="submit" disabled={pending || (resolution === "resolved" && !materialId)}>{pending ? "Saving…" : "Close report"}</Button></div>
    {state.message && <p role={state.ok ? "status" : "alert"} className={`sm:col-span-2 text-sm ${state.ok ? "text-emerald-700" : "text-red-700"}`}>{state.message}</p>}
  </form>;
}
