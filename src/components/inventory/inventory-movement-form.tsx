"use client";
import { useActionState, useState } from "react";
import { dispatchTransferAction, returnSiteStockAction, stockInAction, stockOutAction, type InventoryActionState } from "@/app/(workspace)/inventory/actions";
import { RecordFormControls } from "@/components/ui/record-create-dialog";
import { PagedReferencePicker } from "@/components/ui/paged-reference-picker";
import { FormField, fieldControlClass } from "@/components/ui/form-field";
import type { LocationView } from "@/lib/data/inventory";
import { SelectPicker } from "@/components/ui/select-picker";

type MaterialOption = { id: string; code: string; name: string; base_unit_id: string; material_kind: string };
type UnitOption = { id: string; name: string; symbol: string };
type Mode = "stock-in" | "stock-out" | "transfer" | "return";
const initialState: InventoryActionState = { ok: false, message: "" };

export function InventoryMovementForm({ mode, materials, units, locations, initialMaterialId = "" }: { mode: Mode; materials: MaterialOption[]; units: UnitOption[]; locations: LocationView[]; initialMaterialId?: string }) {
  const serverAction = mode === "stock-in" ? stockInAction : mode === "stock-out" ? stockOutAction : mode === "return" ? returnSiteStockAction : dispatchTransferAction;
  const [state, action, pending] = useActionState(serverAction, initialState);
  const [chosenUnitId, setChosenUnitId] = useState("");
  const [materialId, setMaterialId] = useState(() => materials.some((item) => item.id === initialMaterialId) ? initialMaterialId : "");
  const [destinationId, setDestinationId] = useState("");
  const [sourceId, setSourceId] = useState("");
  const [quantity, setQuantity] = useState("");
  const [totalCost, setTotalCost] = useState("");
  const [remarks, setRemarks] = useState("");
  const [idempotencyKey] = useState(() => globalThis.crypto.randomUUID());
  const material = materials.find((item) => item.id === materialId);
  const unit = units.find((item) => item.id === (chosenUnitId || material?.base_unit_id));
  const warehouses = locations.filter((item) => item.location_type === "warehouse");
  const sites = locations.filter((item) => item.location_type === "project_site");
  const siteException = mode === "transfer" && locations.some((item) => item.id === destinationId && item.location_type === "project_site");
  const error = (field: string) => state.ok ? undefined : state.fieldErrors?.[field]?.[0];
  const locationOptions = (items: LocationView[]) => items.map((item) => ({ value: item.id, label: `${item.name} - ${item.detail}` }));
  return <form action={action} className="rounded-xl border border-slate-200 bg-white p-5 sm:p-6">
    <input type="hidden" name="idempotencyKey" value={idempotencyKey} /><input type="hidden" name="unitId" value={unit?.id ?? ""} />
    <div className="grid gap-5 md:grid-cols-2">
      <FormField label="Material" htmlFor="materialId" error={error("materialId")}><input type="hidden" name="materialId" value={materialId} /><PagedReferencePicker kind="material" label="Material" value={materialId} onValueChange={setMaterialId} onPick={(choice) => setChosenUnitId(choice.unitId ?? "")} initialOptions={materials.map((m) => ({ value: m.id, label: `${m.code} · ${m.name}`, unitId: m.base_unit_id }))} /></FormField>
      <FormField label="Unit" htmlFor="unitDisplay"><input className={fieldControlClass} id="unitDisplay" value={unit ? `${unit.name} (${unit.symbol})` : "Select a material first"} readOnly disabled /></FormField>
      {mode === "stock-in" && <FormField label="Receiving warehouse" htmlFor="destinationLocationId" error={error("destinationLocationId")}><SelectPicker id="destinationLocationId" name="destinationLocationId" label="Receiving warehouse" placeholder="Select warehouse" value={destinationId} onValueChange={setDestinationId} options={locationOptions(warehouses)} required disabled={pending} /></FormField>}
      {mode !== "stock-in" && <FormField label={mode === "return" ? "Source project site" : "Source warehouse"} htmlFor="sourceLocationId" error={error("sourceLocationId")}><SelectPicker id="sourceLocationId" name="sourceLocationId" label={mode === "return" ? "Source project site" : "Source warehouse"} value={sourceId} onValueChange={setSourceId} options={locationOptions(mode === "return" ? sites : warehouses)} required disabled={pending} /></FormField>}
      {mode === "transfer" && <FormField label="Destination location" htmlFor="destinationLocationId" hint="Deliveries to project sites go through approved requests." error={error("destinationLocationId")}><SelectPicker id="destinationLocationId" name="destinationLocationId" label="Destination location" value={destinationId} onValueChange={setDestinationId} options={locationOptions(locations)} required disabled={pending} /></FormField>}
      {mode === "return" && <FormField label="Receiving warehouse" htmlFor="destinationLocationId" error={error("destinationLocationId")}><SelectPicker id="destinationLocationId" name="destinationLocationId" label="Receiving warehouse" placeholder="Select warehouse" value={destinationId} onValueChange={setDestinationId} options={locationOptions(warehouses)} required disabled={pending} /></FormField>}
      <FormField label="Quantity" htmlFor="quantity" error={error("quantity")}><input className={fieldControlClass} id="quantity" name="quantity" value={quantity} onChange={(event) => setQuantity(event.target.value)} disabled={pending} inputMode="decimal" placeholder="0.0000" required /></FormField>
      {mode === "stock-in" && <FormField label="Verified total material cost (PHP)" htmlFor="totalCost" hint="Total from the supplier invoice or receipt." error={error("totalCost")}><input className={fieldControlClass} id="totalCost" name="totalCost" value={totalCost} onChange={(event) => setTotalCost(event.target.value)} disabled={pending} type="number" inputMode="decimal" min="0" step="0.01" required /></FormField>}
      <p className="text-sm text-slate-500 md:col-span-2">The system generates a movement reference and today’s Philippine date when you save. Retries keep the same reference and date.</p>
      <FormField label={mode === "stock-out" || siteException || mode === "return" || mode === "stock-in" ? "Reason" : "Remarks"} htmlFor="remarks" className="md:col-span-2" error={error("remarks")}><textarea className={`${fieldControlClass} h-auto py-3`} id="remarks" name="remarks" value={remarks} onChange={(event) => setRemarks(event.target.value)} disabled={pending} rows={3} required={mode === "stock-out" || siteException || mode === "return" || mode === "stock-in"} /></FormField>
    </div>
    {!state.ok && state.message && <p role="alert" className="mt-5 text-sm font-medium text-red-600">{state.message}</p>}
    <RecordFormControls busy={pending} disabled={!unit} label={mode === "stock-in" ? "Record stock in" : mode === "stock-out" ? "Record stock out" : mode === "return" ? "Dispatch return" : "Dispatch transfer"} />
  </form>;
}
