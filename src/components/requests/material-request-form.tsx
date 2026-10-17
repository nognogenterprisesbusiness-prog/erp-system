"use client";

import { useActionState, useState } from "react";
import { IntentLink as Link } from "@/components/layout/intent-link";
import { PlusSignIcon, Remove01Icon } from "@hugeicons/core-free-icons";
import { HugeiconsIcon } from "@hugeicons/react";
import { submitMaterialRequestAction, type RequestActionState } from "@/app/(workspace)/requests/actions";
import { Button } from "@/components/ui/button";
import { PagedReferencePicker } from "@/components/ui/paged-reference-picker";
import { FormField, fieldControlClass } from "@/components/ui/form-field";
import { SelectPicker } from "@/components/ui/select-picker";
import type { getMaterialRequestFormChoices } from "@/lib/data/material-requests";

type Choices = Awaited<ReturnType<typeof getMaterialRequestFormChoices>>;
type Line = { key: string; materialId: string; quantity: string };
const initialState: RequestActionState = { ok: false, message: "" };

export function MaterialRequestForm({ choices, idempotencyKey, initialLineKey, initialMaterialId = "", initialProjectId, initialSiteId, initialQuantity }: { choices: Choices; idempotencyKey: string; initialLineKey: string; initialMaterialId?: string; initialProjectId?: string; initialSiteId?: string; initialQuantity?: string }) {
  const [state, action, pending] = useActionState(submitMaterialRequestAction, initialState);
  const [requestKey] = useState(idempotencyKey);
  const [purpose, setPurpose] = useState("");
  const [projectId, setProjectId] = useState(initialProjectId ?? choices.projects[0]?.id ?? "");
  const [siteId, setSiteId] = useState(initialSiteId ?? "");
  const [lines, setLines] = useState<Line[]>([{ key: initialLineKey, materialId: initialMaterialId, quantity: initialQuantity ?? "" }]);
  const sites = choices.sites.filter((item) => item.project_id === projectId);
  const selectedSite = sites.some((item) => item.id === siteId) ? siteId : sites[0]?.id ?? "";
  const error = (field: string) => state.ok ? undefined : state.fieldErrors?.[field]?.[0];
  const updateLine = (key: string, patch: Partial<Line>) => setLines((current) => current.map((line) => line.key === key ? { ...line, ...patch } : line));
  const payload = lines.map(({ materialId, quantity }) => ({ materialId, quantity }));

  return <form action={action} className="rounded-xl border border-slate-200 bg-white p-5 shadow-sm sm:p-6">
    <input type="hidden" name="idempotencyKey" value={requestKey} />
    <input type="hidden" name="projectId" value={projectId} />
    <input type="hidden" name="siteId" value={selectedSite} />
    <input type="hidden" name="lines" value={JSON.stringify(payload)} />
    <div className="grid gap-5 md:grid-cols-2">
      <FormField label="Project" htmlFor="requestProject" error={error("projectId")}>
        <SelectPicker id="requestProject" disabled={pending} label="Project" value={projectId} onValueChange={(next) => { setProjectId(next); setSiteId(""); setLines((current) => current.map((line) => ({ ...line, materialId: "" }))); }} options={choices.projects.map((item) => ({ value: item.id, label: `${item.code} · ${item.name}` }))} />
      </FormField>
      <FormField label="Site" htmlFor="requestSite" error={error("siteId")}>
        <SelectPicker id="requestSite" disabled={pending} label="Site" value={selectedSite} onValueChange={setSiteId} options={sites.map((item) => ({ value: item.id, label: item.name }))} placeholder="Select site" />
      </FormField>
      <FormField label="Purpose" htmlFor="purpose" className="md:col-span-2" error={error("purpose")}>
        <textarea className={`${fieldControlClass} h-auto py-3`} id="purpose" name="purpose" rows={2} maxLength={500} minLength={3} required value={purpose} onChange={(event) => setPurpose(event.target.value)} disabled={pending} />
      </FormField>
    </div>
    <div className="mt-7 flex items-center justify-between gap-3 border-t border-slate-100 pt-6">
      <div><h2 className="text-base font-semibold text-slate-900">Materials</h2><p className="mt-1 text-xs text-slate-500">Select catalog materials and quantities. Admin or Warehouse Staff chooses the source before approval.</p></div>
      <Button type="button" variant="outline" size="sm" disabled={lines.length >= 20 || pending} onClick={() => setLines((current) => [...current, { key: crypto.randomUUID(), materialId: "", quantity: "" }])}>
        <HugeiconsIcon icon={PlusSignIcon} size={16} />Add line
      </Button>
    </div>
    <div className="mt-4 grid gap-3">{lines.map((line, index) => <div key={line.key} className="grid gap-3 rounded-lg border border-slate-200 p-3 sm:grid-cols-[minmax(0,1fr)_150px_auto] sm:items-start">
      <FormField label={`Material ${index + 1}`} htmlFor={`material-${line.key}`}>
        <PagedReferencePicker disabled={pending} key={`${projectId}:${selectedSite}`} kind="material" label={`Material ${index + 1}`} value={line.materialId} onValueChange={(materialId) => updateLine(line.key, { materialId })} initialOptions={choices.materials.map((item) => ({ value: item.id, label: `${item.code} · ${item.name}`, unitId: item.base_unit_id }))} disabledValues={lines.filter((other) => other.key !== line.key).map((other) => other.materialId)} />
      </FormField>
      <FormField label="Quantity" htmlFor={`quantity-${line.key}`}><input id={`quantity-${line.key}`} className={fieldControlClass} inputMode="decimal" disabled={pending} value={line.quantity} onChange={(event) => updateLine(line.key, { quantity: event.target.value })} placeholder="0.0000" required /></FormField>
      <Button type="button" variant="ghost" size="icon" className="sm:mt-7" aria-label={`Remove material ${index + 1}`} disabled={lines.length === 1 || pending} onClick={() => setLines((current) => current.filter((item) => item.key !== line.key))}><HugeiconsIcon icon={Remove01Icon} size={17} /></Button>
    </div>)}</div>
    {error("lines") && <p role="alert" className="mt-2 text-xs text-red-600">{error("lines")}</p>}
    {!state.ok && state.message && <p role="alert" className="mt-5 text-sm font-medium text-red-600">{state.message}</p>}
    <div className="mt-6 flex flex-wrap justify-end gap-2"><Button variant="outline" type="button" asChild><Link href="/requests">Cancel</Link></Button><Button type="submit" disabled={pending || !projectId || !selectedSite || lines.some((line) => !line.materialId || !line.quantity)}>{pending ? "Submitting…" : "Submit request"}</Button></div>
  </form>;
}
