"use client";

import { useActionState, useState } from "react";
import { consumeSiteMaterialAction, type InventoryActionState } from "@/app/(workspace)/inventory/actions";
import { Button } from "@/components/ui/button";
import { FormField, fieldControlClass } from "@/components/ui/form-field";
import { todayInManila } from "@/lib/date";

type Option = { id: string; code: string; name: string; base_unit_id: string };
type Unit = { id: string; symbol: string };
type Site = { id: string; name: string; projectId: string | null };
type Balance = { material_id: string; inventory_location_id: string; available_quantity: number };
const initialState: InventoryActionState = { ok: false, message: "" };

export function SiteConsumptionForm({ projects, materials, units, sites, balances, initialMaterialId = "" }: {
  projects: { id: string; code: string; name: string }[]; materials: Option[]; units: Unit[]; sites: Site[]; balances: Balance[]; initialMaterialId?: string;
}) {
  const [state, action, pending] = useActionState(consumeSiteMaterialAction, initialState);
  const [idempotencyKey] = useState(() => crypto.randomUUID());
  const [projectId, setProjectId] = useState("");
  const [siteId, setSiteId] = useState("");
  const [materialId, setMaterialId] = useState("");
  const projectSites = sites.filter((site) => site.projectId === projectId);
  const siteBalances = balances.filter((balance) => balance.inventory_location_id === siteId);
  const available = siteBalances.find((balance) => balance.material_id === materialId)?.available_quantity ?? 0;
  const availableIds = new Set(siteBalances.map((balance) => balance.material_id));
  const options = materials.filter((material) => availableIds.has(material.id));
  const material = options.find((item) => item.id === materialId);
  const unit = units.find((item) => item.id === material?.base_unit_id);
  const error = (field: string) => state.ok ? undefined : state.fieldErrors?.[field]?.[0];

  return <form action={action} className="rounded-xl border border-slate-200 bg-white p-5 sm:p-6">
    <input type="hidden" name="idempotencyKey" value={idempotencyKey} />
    <input type="hidden" name="unitId" value={unit?.id ?? ""} />
    <div className="grid gap-5 md:grid-cols-2">
      <FormField label="Project" htmlFor="projectId" error={error("projectId")}>
        <select id="projectId" name="projectId" value={projectId} onChange={(event) => { setProjectId(event.target.value); setSiteId(""); setMaterialId(""); }} className={fieldControlClass} required>
          <option value="" disabled>Select project</option>{projects.map((project) => <option key={project.id} value={project.id}>{project.code} · {project.name}</option>)}
        </select>
      </FormField>
      <FormField label="Project site" htmlFor="siteLocationId" error={error("siteLocationId")}>
        <select id="siteLocationId" name="siteLocationId" value={siteId} onChange={(event) => { const nextSite = event.target.value; setSiteId(nextSite); setMaterialId(balances.some((balance) => balance.inventory_location_id === nextSite && balance.material_id === initialMaterialId && balance.available_quantity > 0) ? initialMaterialId : ""); }} className={fieldControlClass} required>
          <option value="" disabled>Select site</option>{projectSites.map((site) => <option key={site.id} value={site.id}>{site.name}</option>)}
        </select>
      </FormField>
      <FormField label="Material" htmlFor="materialId" error={error("materialId")}>
        <select id="materialId" name="materialId" value={materialId} onChange={(event) => setMaterialId(event.target.value)} className={fieldControlClass} required>
          <option value="" disabled>Select material</option>{options.map((item) => <option key={item.id} value={item.id}>{item.code} · {item.name}</option>)}
        </select>
      </FormField>
      <FormField label={unit ? "Quantity (" + unit.symbol + ", " + available + " available)" : "Quantity"} htmlFor="quantity" error={error("quantity")}>
        <input id="quantity" name="quantity" type="number" min="0.0001" max={available || undefined} step="0.0001" inputMode="decimal" className={fieldControlClass} required />
      </FormField>
      <FormField label="Daily report / usage reference" htmlFor="referenceNumber" error={error("referenceNumber")}>
        <input id="referenceNumber" name="referenceNumber" minLength={2} maxLength={120} className={fieldControlClass} required />
      </FormField>
      <FormField label="Date used" htmlFor="transactionDate" error={error("transactionDate")}>
        <input id="transactionDate" name="transactionDate" type="date" defaultValue={todayInManila()} className={fieldControlClass} required />
      </FormField>
      <FormField label="Usage note" htmlFor="remarks" className="md:col-span-2" error={error("remarks")}>
        <textarea id="remarks" name="remarks" rows={3} className={fieldControlClass + " h-auto py-3"} />
      </FormField>
    </div>
    {!state.ok && state.message && <p role="alert" className="mt-5 text-sm text-red-600">{state.message}</p>}
    <div className="mt-6 flex justify-end"><Button type="submit" disabled={pending || !material || available <= 0}>{pending ? "Posting…" : "Record consumption"}</Button></div>
  </form>;
}
