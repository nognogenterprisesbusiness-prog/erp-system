"use client";

import { useActionState, useMemo, useState } from "react";
import {
  addSupplierPriceAction,
  archiveSupplierAction,
  archiveSupplierMaterialAction,
  closeSupplierPriceAction,
  saveSupplierMaterialAction,
  type SupplierActionState,
} from "@/app/(workspace)/suppliers/actions";
import { Button } from "@/components/ui/button";
import { fieldControlClass } from "@/components/ui/form-field";
import { todayInManila } from "@/lib/date";
import type { SupplierMaterialRow, SupplierPriceRow, UnitRow } from "@/types/database";

const initialState: SupplierActionState = { ok: false, message: "" };
const today = todayInManila();
type MaterialOption = { id: string; code: string; name: string; base_unit_id: string };

function FormMessage({ state }: { state: SupplierActionState }) {
  if (!state.message) return null;
  return <p role="status" className={`text-xs font-medium ${state.ok ? "text-emerald-700" : "text-red-600"}`}>{state.message}</p>;
}

export function SupplierMaterialForm({ supplierId, catalog, materials, units }: {
  supplierId: string;
  catalog?: SupplierMaterialRow;
  materials: MaterialOption[];
  units: UnitRow[];
}) {
  const [state, action, pending] = useActionState(saveSupplierMaterialAction, initialState);
  const [materialId, setMaterialId] = useState(catalog?.material_id ?? "");
  const selectedMaterial = useMemo(() => materials.find((material) => material.id === materialId), [materials, materialId]);
  const selectedUnit = units.find((unit) => unit.id === selectedMaterial?.base_unit_id);
  return <form action={action} className="grid gap-3 rounded-lg bg-slate-50 p-4 md:grid-cols-2 xl:grid-cols-6">
    <input type="hidden" name="supplierId" value={supplierId} />{catalog && <input type="hidden" name="id" value={catalog.id} />}<input type="hidden" name="unitId" value={selectedMaterial?.base_unit_id ?? ""} />
    <select className={fieldControlClass} name="materialId" aria-label="Material" value={materialId} onChange={(event) => setMaterialId(event.target.value)} required><option value="" disabled>Select material</option>{materials.map((material) => <option key={material.id} value={material.id}>{material.code} · {material.name}</option>)}</select>
    <input className={fieldControlClass} value={selectedUnit ? `${selectedUnit.name} (${selectedUnit.symbol})` : "Select a material first"} aria-label="Unit of measure" readOnly />
    <input className={fieldControlClass} name="supplierMaterialCode" aria-label="Supplier material code" placeholder="Supplier item code" defaultValue={catalog?.supplier_material_code} required />
    <input className={fieldControlClass} name="minimumOrderQuantity" aria-label="Minimum order quantity" inputMode="decimal" placeholder="Minimum order" defaultValue={catalog?.minimum_order_quantity ?? ""} required />
    <input className={fieldControlClass} name="leadTimeDays" aria-label="Lead time in days" type="number" min="0" max="3650" placeholder="Lead days" defaultValue={catalog?.lead_time_days ?? ""} />
    <select className={fieldControlClass} name="availabilityStatus" aria-label="Availability" defaultValue={catalog?.availability_status ?? "available"}><option value="available">Available</option><option value="limited">Limited</option><option value="unavailable">Unavailable</option><option value="discontinued">Discontinued</option></select>
    <div className="flex items-center gap-3 md:col-span-2 xl:col-span-6"><Button type="submit" size="sm" disabled={pending || !selectedMaterial}>{pending ? "Saving…" : catalog ? "Update catalog entry" : "Add material"}</Button><FormMessage state={state} /></div>
  </form>;
}

export function SupplierPriceForm({ supplierId, supplierMaterialId }: { supplierId: string; supplierMaterialId: string }) {
  const [state, action, pending] = useActionState(addSupplierPriceAction, initialState);
  return <form action={action} className="mt-3 grid gap-2 rounded-lg bg-slate-50 p-3 sm:grid-cols-2 xl:grid-cols-5"><input type="hidden" name="supplierId" value={supplierId} /><input type="hidden" name="supplierMaterialId" value={supplierMaterialId} /><input className={fieldControlClass} name="unitPrice" aria-label="Unit price" inputMode="decimal" placeholder="Unit price" required /><input className={fieldControlClass} name="currency" aria-label="Currency" defaultValue="PHP" maxLength={3} required /><input className={fieldControlClass} name="effectiveStartDate" aria-label="Effective start date" type="date" defaultValue={today} required /><input className={fieldControlClass} name="effectiveEndDate" aria-label="Effective end date" type="date" /><Button type="submit" size="sm" disabled={pending}>{pending ? "Adding…" : "Add price"}</Button><div className="sm:col-span-2 xl:col-span-5"><FormMessage state={state} /></div></form>;
}

export function CloseSupplierPriceForm({ supplierId, price }: { supplierId: string; price: SupplierPriceRow }) {
  const [state, action, pending] = useActionState(closeSupplierPriceAction, initialState);
  return <form action={action} className="flex flex-wrap items-center justify-end gap-2"><input type="hidden" name="supplierId" value={supplierId} /><input type="hidden" name="priceId" value={price.id} /><input className="h-9 rounded-md border border-slate-200 px-2 text-xs" name="effectiveEndDate" aria-label="Price end date" type="date" min={price.effective_start_date} defaultValue={today < price.effective_start_date ? price.effective_start_date : today} required /><Button variant="outline" size="sm" disabled={pending}>{pending ? "Closing…" : "Close price"}</Button><FormMessage state={state} /></form>;
}

export function ArchiveSupplierMaterialForm({ supplierId, catalogId }: { supplierId: string; catalogId: string }) {
  const [state, action, pending] = useActionState(archiveSupplierMaterialAction, initialState);
  return <form action={action} className="flex items-center gap-2"><input type="hidden" name="supplierId" value={supplierId} /><input type="hidden" name="id" value={catalogId} /><Button variant="ghost" size="sm" disabled={pending}>{pending ? "Archiving…" : "Archive"}</Button><FormMessage state={state} /></form>;
}

export function ArchiveSupplierForm({ supplierId }: { supplierId: string }) {
  const [state, action, pending] = useActionState(archiveSupplierAction, initialState);
  return <form action={action} className="flex flex-wrap items-center justify-end gap-2"><input type="hidden" name="id" value={supplierId} /><input className="h-10 min-w-52 rounded-lg border border-slate-200 px-3 text-sm" name="reason" placeholder="Archive reason" minLength={3} required /><Button variant="outline" disabled={pending}>{pending ? "Archiving…" : "Archive supplier"}</Button><FormMessage state={state} /></form>;
}
