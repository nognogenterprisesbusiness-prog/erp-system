"use client";

import { useActionState, useState } from "react";
import { saveProjectMaterialPlanAction, type PlanActionState } from "@/app/(workspace)/projects/[id]/materials/actions";
import { Button } from "@/components/ui/button";
import { FormField, fieldControlClass } from "@/components/ui/form-field";
import { SelectPicker } from "@/components/ui/select-picker";
import { todayInManila } from "@/lib/date";
import type { getMaterialRequestChoices } from "@/lib/data/material-requests";

type Choices = Awaited<ReturnType<typeof getMaterialRequestChoices>>;

export function ProjectMaterialPlanForm({ projectId, choices, initial }: { projectId: string; choices: Choices; initial?: { siteId: string; warehouseId: string; materialId: string; quantity: string; requiredOn: string; note: string } }) {
  const [state, action, pending] = useActionState<PlanActionState, FormData>(saveProjectMaterialPlanAction, { message: "" });
  const sites = choices.sites.filter((site) => site.project_id === projectId);
  const warehouses = choices.warehouses.filter((warehouse) => warehouse.project_id === projectId);
  const [siteId, setSiteId] = useState(initial?.siteId ?? sites[0]?.id ?? "");
  const [warehouseId, setWarehouseId] = useState(initial?.warehouseId ?? warehouses[0]?.warehouse_id ?? "");
  const [materialId, setMaterialId] = useState(initial?.materialId ?? choices.materials[0]?.id ?? "");
  const errors = state.fieldErrors;
  return <form action={action} className="mt-5 grid gap-4 border-t border-slate-100 pt-5 sm:grid-cols-2 xl:grid-cols-5">
    <input type="hidden" name="projectId" value={projectId} />
    <input type="hidden" name="siteId" value={siteId} />
    <input type="hidden" name="warehouseId" value={warehouseId} />
    <input type="hidden" name="materialId" value={materialId} />
    <FormField label="Site" htmlFor="plan-site" error={errors?.siteId?.[0]}><SelectPicker label="Site" value={siteId} onValueChange={setSiteId} options={sites.map((site) => ({ value: site.id, label: site.name }))} /></FormField>
    <FormField label="Source warehouse" htmlFor="plan-warehouse" error={errors?.warehouseId?.[0]}><SelectPicker label="Source warehouse" value={warehouseId} onValueChange={setWarehouseId} options={warehouses.map((warehouse) => ({ value: warehouse.warehouse_id, label: warehouse.name }))} /></FormField>
    <FormField label="Material" htmlFor="plan-material" error={errors?.materialId?.[0]}><SelectPicker label="Material" value={materialId} onValueChange={setMaterialId} options={choices.materials.map((material) => ({ value: material.id, label: `${material.code} · ${material.name}` }))} /></FormField>
    <FormField label="Planned quantity" htmlFor="plan-quantity" error={errors?.quantity?.[0]}><input id="plan-quantity" name="quantity" inputMode="decimal" defaultValue={initial?.quantity} className={fieldControlClass} required /></FormField>
    <FormField label="Required by" htmlFor="plan-date" error={errors?.requiredOn?.[0]}><input id="plan-date" name="requiredOn" type="date" defaultValue={initial?.requiredOn ?? todayInManila()} className={fieldControlClass} required /></FormField>
    <FormField label="Note" htmlFor="plan-note" className="sm:col-span-2 xl:col-span-4" error={errors?.note?.[0]}><input id="plan-note" name="note" maxLength={500} defaultValue={initial?.note} className={fieldControlClass} placeholder="Optional planning note" /></FormField>
    <div className="flex items-end"><Button type="submit" disabled={pending || !siteId || !warehouseId || !materialId}>{pending ? "Saving…" : initial ? "Update plan" : "Save plan"}</Button></div>
    {state.message && <p role="status" className={`text-sm sm:col-span-2 xl:col-span-5 ${state.ok ? "text-emerald-700" : "text-red-700"}`}>{state.message}</p>}
  </form>;
}
