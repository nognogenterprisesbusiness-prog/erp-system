"use client";
import { useActionState, useMemo, useState } from "react";
import { dispatchTransferAction, returnSiteStockAction, stockInAction, stockOutAction, type InventoryActionState } from "@/app/(workspace)/inventory/actions";
import { Button } from "@/components/ui/button";
import { FormField, fieldControlClass } from "@/components/ui/form-field";
import type { LocationView } from "@/lib/data/inventory";
import { todayInManila } from "@/lib/date";

type MaterialOption = { id: string; code: string; name: string; base_unit_id: string; material_kind: string };
type UnitOption = { id: string; name: string; symbol: string };
type Mode = "stock-in" | "stock-out" | "transfer" | "return";
const initialState: InventoryActionState = { ok: false, message: "" };

export function InventoryMovementForm({ mode, materials, units, locations }: { mode: Mode; materials: MaterialOption[]; units: UnitOption[]; locations: LocationView[] }) {
  const serverAction = mode === "stock-in" ? stockInAction : mode === "stock-out" ? stockOutAction : mode === "return" ? returnSiteStockAction : dispatchTransferAction;
  const [state, action, pending] = useActionState(serverAction, initialState);
  const [materialId, setMaterialId] = useState("");
  const [destinationId, setDestinationId] = useState("");
  const [idempotencyKey] = useState(() => globalThis.crypto.randomUUID());
  const material = materials.find((item) => item.id === materialId);
  const unit = units.find((item) => item.id === material?.base_unit_id);
  const warehouses = locations.filter((item) => item.location_type === "warehouse");
  const sites = locations.filter((item) => item.location_type === "project_site");
  const siteException = mode === "transfer" && locations.some((item) => item.id === destinationId && item.location_type === "project_site");
  const error = (field: string) => state.ok ? undefined : state.fieldErrors?.[field]?.[0];
  const locationOptions = useMemo(() => (items: LocationView[]) => items.map((item) => <option key={item.id} value={item.id}>{item.name} — {item.detail}</option>), []);
  return <form action={action} className="rounded-xl border border-slate-200 bg-white p-5 sm:p-6">
    <input type="hidden" name="idempotencyKey" value={idempotencyKey} /><input type="hidden" name="unitId" value={unit?.id ?? ""} />
    <div className="grid gap-5 md:grid-cols-2">
      <FormField label="Material" htmlFor="materialId" error={error("materialId")}><select className={fieldControlClass} id="materialId" name="materialId" value={materialId} onChange={(event) => setMaterialId(event.target.value)} required><option value="" disabled>Select material</option>{materials.map((item) => <option key={item.id} value={item.id}>{item.code} · {item.name}</option>)}</select></FormField>
      <FormField label="Unit" htmlFor="unitDisplay" hint="Units cannot be converted silently."><input className={fieldControlClass} id="unitDisplay" value={unit ? `${unit.name} (${unit.symbol})` : "Select a material first"} readOnly disabled /></FormField>
      {mode === "stock-in" && <FormField label="Receiving warehouse" htmlFor="destinationLocationId" error={error("destinationLocationId")}><select className={fieldControlClass} id="destinationLocationId" name="destinationLocationId" defaultValue="" required><option value="" disabled>Select warehouse</option>{locationOptions(warehouses)}</select></FormField>}
      {mode !== "stock-in" && <FormField label={mode === "return" ? "Source project site" : "Source warehouse"} htmlFor="sourceLocationId" error={error("sourceLocationId")}><select className={fieldControlClass} id="sourceLocationId" name="sourceLocationId" defaultValue="" required><option value="" disabled>Select {mode === "return" ? "site" : "warehouse"}</option>{locationOptions(mode === "return" ? sites : warehouses)}</select></FormField>}
      {mode === "transfer" && <FormField label="Destination location" htmlFor="destinationLocationId" hint="Site deliveries use the approved request queue. Only administrators can post a direct exception." error={error("destinationLocationId")}><select className={fieldControlClass} id="destinationLocationId" name="destinationLocationId" value={destinationId} onChange={(event) => setDestinationId(event.target.value)} required><option value="" disabled>Select location</option>{locationOptions(locations)}</select></FormField>}
      {mode === "return" && <FormField label="Receiving warehouse" htmlFor="destinationLocationId" error={error("destinationLocationId")}><select className={fieldControlClass} id="destinationLocationId" name="destinationLocationId" defaultValue="" required><option value="" disabled>Select warehouse</option>{locationOptions(warehouses)}</select></FormField>}
      <FormField label="Quantity" htmlFor="quantity" error={error("quantity")}><input className={fieldControlClass} id="quantity" name="quantity" inputMode="decimal" placeholder="0.0000" required /></FormField>
      {mode === "stock-in" && <FormField label="Verified total material cost (PHP)" htmlFor="totalCost" hint="Use the supplier invoice or approved receipt value; do not guess a unit cost." error={error("totalCost")}><input className={fieldControlClass} id="totalCost" name="totalCost" type="number" inputMode="decimal" min="0" step="0.01" required /></FormField>}
      <FormField label="Reference number" htmlFor="referenceNumber" error={error("referenceNumber")}><input className={fieldControlClass} id="referenceNumber" name="referenceNumber" required /></FormField>
      <FormField label={mode === "stock-in" ? "Date received" : mode === "transfer" || mode === "return" ? "Dispatch date" : "Release date"} htmlFor="transactionDate" error={error("transactionDate")}><input className={fieldControlClass} id="transactionDate" name="transactionDate" type="date" defaultValue={todayInManila()} required /></FormField>
      <FormField label={mode === "stock-out" || siteException || mode === "return" || mode === "stock-in" ? "Exception / return reason" : "Remarks"} htmlFor="remarks" className="md:col-span-2" error={error("remarks")}><textarea className={`${fieldControlClass} h-auto py-3`} id="remarks" name="remarks" rows={3} required={mode === "stock-out" || siteException || mode === "return" || mode === "stock-in"} /></FormField>
    </div>
    {!state.ok && state.message && <p role="alert" className="mt-5 text-sm font-medium text-red-600">{state.message}</p>}
    <div className="mt-6 flex justify-end"><Button size="lg" type="submit" disabled={pending || !unit}>{pending ? "Posting…" : mode === "stock-in" ? "Post exception receipt" : mode === "stock-out" ? "Post stock out" : mode === "return" ? "Dispatch return" : "Dispatch transfer"}</Button></div>
  </form>;
}
