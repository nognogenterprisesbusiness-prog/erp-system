"use client";
import { useActionState } from "react";
import { saveAssetAction, type AssetActionState } from "@/app/(workspace)/equipment/actions";
import { Button } from "@/components/ui/button";
import { FormField, fieldControlClass } from "@/components/ui/form-field";
import type { AssetLocationView, AssetView } from "@/lib/data/assets";
import type { AssetCategoryRow, AssetKind } from "@/types/database";

const initialState: AssetActionState = { ok: false, message: "" };
export function AssetForm({ kind, asset, categories, locations }: { kind: AssetKind; asset?: AssetView; categories: AssetCategoryRow[]; locations: AssetLocationView[] }) {
  const [state, action, pending] = useActionState(saveAssetAction, initialState);
  const error = (field: string) => state.ok ? undefined : state.fieldErrors?.[field]?.[0];
  const isEquipment = kind === "equipment";
  return <form action={action} className="rounded-xl border border-slate-200 bg-white p-5 sm:p-6">
    <input type="hidden" name="assetKind" value={kind} />{asset && <input type="hidden" name="id" value={asset.id} />}
    <div className="grid gap-5 md:grid-cols-2">
      <FormField label={`${isEquipment ? "Equipment" : "Vehicle"} code`} htmlFor="code" error={error("code")}><input className={fieldControlClass} id="code" name="code" defaultValue={asset?.code} placeholder={isEquipment ? "EQ-EXC-001" : "VEH-DT-001"} required /></FormField>
      {isEquipment && <FormField label="SKU" htmlFor="sku" hint="Optional catalog or model SKU; separate from the asset code and serial number." error={error("sku")}><input className={fieldControlClass} id="sku" name="sku" defaultValue={asset?.equipment?.sku ?? ""} placeholder="CAT-320-GX" /></FormField>}
      <FormField label={`${isEquipment ? "Equipment" : "Vehicle"} name`} htmlFor="name" error={error("name")}><input className={fieldControlClass} id="name" name="name" defaultValue={asset?.name} required /></FormField>
      <FormField label={isEquipment ? "Equipment category" : "Vehicle type"} htmlFor="categoryId" error={error("categoryId")}><select className={fieldControlClass} id="categoryId" name="categoryId" defaultValue={asset?.category_id ?? ""} required><option value="" disabled>Select classification</option>{categories.map((item) => <option key={item.id} value={item.id}>{item.name}</option>)}</select></FormField>
      {isEquipment ? <FormField label="Equipment type" htmlFor="equipmentType" error={error("equipmentType")}><input className={fieldControlClass} id="equipmentType" name="equipmentType" defaultValue={asset?.equipment?.equipment_type} placeholder="Hydraulic excavator" required /></FormField> : <FormField label="Plate number" htmlFor="plateNumber" error={error("plateNumber")}><input className={fieldControlClass} id="plateNumber" name="plateNumber" defaultValue={asset?.vehicle?.plate_number} required /></FormField>}
      <FormField label="Brand" htmlFor="brand" error={error("brand")}><input className={fieldControlClass} id="brand" name="brand" defaultValue={asset?.brand} required /></FormField>
      <FormField label="Model" htmlFor="model" error={error("model")}><input className={fieldControlClass} id="model" name="model" defaultValue={asset?.model} required /></FormField>
      {isEquipment ? <FormField label="Serial number" htmlFor="serialNumber" error={error("serialNumber")}><input className={fieldControlClass} id="serialNumber" name="serialNumber" defaultValue={asset?.equipment?.serial_number} required /></FormField> : <FormField label="Manufacture year" htmlFor="manufactureYear" error={error("manufactureYear")}><input className={fieldControlClass} id="manufactureYear" name="manufactureYear" type="number" min="1886" max={new Date().getFullYear() + 1} defaultValue={asset?.vehicle?.manufacture_year} required /></FormField>}
      <FormField label="Acquisition date" htmlFor="acquisitionDate" error={error("acquisitionDate")}><input className={fieldControlClass} id="acquisitionDate" name="acquisitionDate" type="date" defaultValue={asset?.acquisition_date} required /></FormField>
      {isEquipment ? <FormField label="Acquisition cost" htmlFor="acquisitionCost" hint="Stored using authoritative decimal precision." error={error("acquisitionCost")}><input className={fieldControlClass} id="acquisitionCost" name="acquisitionCost" inputMode="decimal" defaultValue={asset?.equipment?.acquisition_cost ?? ""} required /></FormField> : <FormField label="Current mileage" htmlFor="currentMileage" hint="Mileage cannot be reduced." error={error("currentMileage")}><input className={fieldControlClass} id="currentMileage" name="currentMileage" inputMode="decimal" defaultValue={asset?.vehicle?.current_mileage ?? "0"} required /></FormField>}
      <FormField label="Ownership" htmlFor="ownershipType" error={error("ownershipType")}><select className={fieldControlClass} id="ownershipType" name="ownershipType" defaultValue={asset?.ownership_type ?? "company_owned"}><option value="company_owned">Company owned</option><option value="rented">Rented</option><option value="leased">Leased</option></select></FormField>
      <FormField label="Operational status" htmlFor="status" hint="Admins can record availability or maintenance here. Assignment and use require an audited handover." error={error("status")}><select className={fieldControlClass} id="status" name="status" defaultValue={asset?.status ?? "available"}><option value="available">Available</option><option value="under_maintenance">Under maintenance</option><option value="out_of_service">Out of service</option></select></FormField>
      <FormField label="Current location" htmlFor="currentLocationId" error={error("currentLocationId")}><select className={fieldControlClass} id="currentLocationId" name="currentLocationId" defaultValue={asset?.current_location_id ?? ""} required><option value="" disabled>Select authorized location</option>{locations.map((item) => <option key={item.id} value={item.id}>{item.displayName} · {item.location_kind.replaceAll("_", " ")}</option>)}</select></FormField>
      <FormField label="Description" htmlFor="description" className="md:col-span-2" error={error("description")}><textarea className={`${fieldControlClass} h-auto py-3`} id="description" name="description" rows={3} defaultValue={asset?.description ?? ""} /></FormField>
      <FormField label="Condition notes" htmlFor="conditionNotes" className="md:col-span-2" error={error("conditionNotes")}><textarea className={`${fieldControlClass} h-auto py-3`} id="conditionNotes" name="conditionNotes" rows={3} defaultValue={asset?.condition_notes ?? ""} /></FormField>
    </div>
    {!state.ok && state.message && <p role="alert" className="mt-5 text-sm font-medium text-red-600">{state.message}</p>}
    <div className="mt-6 flex justify-end"><Button type="submit" size="lg" disabled={pending}>{pending ? "Saving…" : asset ? "Save changes" : isEquipment ? "Add equipment" : "Add vehicle"}</Button></div>
  </form>;
}
