"use client";
import { VehicleForm } from "./vehicle-form";
import { SelectPicker } from "@/components/ui/select-picker";
import { DatePicker } from "@/components/ui/date-picker";
import { PesoAmountInput } from "@/components/ui/peso-amount-input";
import { startTransition, useActionState, useEffect, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { RecordPhotoInput } from "@/components/ui/record-photo-input";
import { recordPhotoUrl } from "@/lib/media/record-photo-url";
import { saveAssetAction, type AssetActionState } from "@/app/(workspace)/equipment/actions";
import { RecordFormControls, useRecordDialog } from "@/components/ui/record-create-dialog";
import { FormField, fieldControlClass } from "@/components/ui/form-field";
import type { AssetLocationView, AssetView } from "@/lib/data/assets";
import type { AssetCategoryRow, AssetKind } from "@/types/database";

const initialState: AssetActionState = { ok: false, message: "" };
type AssetFormProps = { kind: AssetKind; asset?: AssetView; categories: AssetCategoryRow[]; locations: AssetLocationView[] };
export function AssetForm({ kind, ...props }: AssetFormProps) {
  return kind === "vehicle" ? <VehicleForm asset={props.asset} locations={props.locations} /> : <EquipmentForm {...props} />;
}

function EquipmentForm({ asset, categories, locations }: Omit<AssetFormProps, "kind">) {
  const [state, action, pending] = useActionState(saveAssetAction, initialState);
  const dialog = useRecordDialog();
  const router = useRouter();
  const completed = useRef(false);
  const photo = useRef<File | null>(null);
  const [processingPhoto, setProcessingPhoto] = useState(false);
  const [photoError, setPhotoError] = useState<string | null>(null);
  useEffect(() => {
    if (!state.ok || completed.current) return;
    completed.current = true;
    if (dialog) dialog.complete();
    else startTransition(() => router.replace(`/equipment/${state.data.id}`));
  }, [state, dialog, router]);
  const error = (field: string) => state.ok ? undefined : state.fieldErrors?.[field]?.[0];
  return <form onSubmit={(event) => {
    event.preventDefault();
    if (pending || processingPhoto || photoError) return;
    const form = new FormData(event.currentTarget);
    if (photo.current) form.set("photo", photo.current);
    startTransition(() => action(form));
  }} className="rounded-xl border border-slate-200 bg-white p-5 sm:p-6">
    <input type="hidden" name="assetKind" value="equipment" /><input type="hidden" name="id" value={state.savedId ?? asset?.id ?? ""} />
    <div className="mb-5"><RecordPhotoInput label="Equipment photo" currentPhoto={asset?.photo_path ? recordPhotoUrl("assets", asset.id, asset.updated_at) : undefined} convertBeforeSubmit onProcessingChange={setProcessingPhoto} onPreparedFile={(file) => { photo.current = file; }} onPreparationError={setPhotoError} /></div>
    <div className="grid gap-5 md:grid-cols-2">
      <FormField label="Equipment code" htmlFor="code" error={error("code")}><input className={fieldControlClass} id="code" name="code" defaultValue={asset?.code} placeholder="EQ-EXC-001" required /></FormField>
      <FormField label="SKU" htmlFor="sku" hint="Optional model or catalog number." error={error("sku")}><input className={fieldControlClass} id="sku" name="sku" defaultValue={asset?.equipment?.sku ?? ""} placeholder="CAT-320-GX" /></FormField>
      <FormField label="Equipment name" htmlFor="name" error={error("name")}><input className={fieldControlClass} id="name" name="name" defaultValue={asset?.name} required /></FormField>
      <FormField label="Equipment category" htmlFor="categoryId" error={error("categoryId")}><SelectPicker id="categoryId" name="categoryId" label="Equipment category" defaultValue={asset?.category_id ?? undefined} placeholder="Select classification" required options={categories.map((item) => ({ value: item.id, label: item.name }))} /></FormField>
      <FormField label="Equipment type" htmlFor="equipmentType" error={error("equipmentType")}><input className={fieldControlClass} id="equipmentType" name="equipmentType" defaultValue={asset?.equipment?.equipment_type} placeholder="Hydraulic excavator" required /></FormField>
      <FormField label="Brand" htmlFor="brand" error={error("brand")}><input className={fieldControlClass} id="brand" name="brand" defaultValue={asset?.brand ?? ""} required /></FormField>
      <FormField label="Model" htmlFor="model" error={error("model")}><input className={fieldControlClass} id="model" name="model" defaultValue={asset?.model ?? ""} required /></FormField>
      <FormField label="Serial number" htmlFor="serialNumber" error={error("serialNumber")}><input className={fieldControlClass} id="serialNumber" name="serialNumber" defaultValue={asset?.equipment?.serial_number} required /></FormField>
      <FormField label="Acquisition date" htmlFor="acquisitionDate" error={error("acquisitionDate")}><DatePicker id="acquisitionDate" name="acquisitionDate" label="Acquisition date" defaultValue={asset?.acquisition_date ?? undefined} required allowClear={false} /></FormField>
      <div><PesoAmountInput label="Acquisition cost" name="acquisitionCost" defaultValue={String(asset?.equipment?.acquisition_cost ?? "")} submitUngrouped required />{error("acquisitionCost") && <p role="alert" className="mt-1 text-xs text-red-600">{error("acquisitionCost")}</p>}</div>
      <FormField label="Ownership" htmlFor="ownershipType" error={error("ownershipType")}><SelectPicker id="ownershipType" name="ownershipType" label="Ownership" defaultValue={asset?.ownership_type ?? "company_owned"} options={[{ value: "company_owned", label: "Company owned" }, { value: "rented", label: "Rented" }, { value: "leased", label: "Leased" }]} /></FormField>
      <FormField label="Operational status" htmlFor="status" error={error("status")}><SelectPicker id="status" name="status" label="Operational status" defaultValue={asset?.status ?? "available"} options={[{ value: "available", label: "Available" }, { value: "under_maintenance", label: "Under maintenance" }, { value: "out_of_service", label: "Out of service" }]} /></FormField>
      <FormField label="Current location" htmlFor="currentLocationId" error={error("currentLocationId")}><SelectPicker id="currentLocationId" name="currentLocationId" label="Current location" defaultValue={asset?.current_location_id} placeholder="Select authorized location" required options={locations.map((item) => ({ value: item.id, label: `${item.displayName} · ${item.location_kind.replaceAll("_", " ")}` }))} /></FormField>
      <FormField label="Description" htmlFor="description" className="md:col-span-2" error={error("description")}><textarea className={`${fieldControlClass} h-auto py-3`} id="description" name="description" rows={3} defaultValue={asset?.description ?? ""} /></FormField>
      <FormField label="Condition notes" htmlFor="conditionNotes" className="md:col-span-2" error={error("conditionNotes")}><textarea className={`${fieldControlClass} h-auto py-3`} id="conditionNotes" name="conditionNotes" rows={3} defaultValue={asset?.condition_notes ?? ""} /></FormField>
    </div>
    {!state.ok && state.message && <p role="alert" className="mt-5 text-sm font-medium text-red-600">{state.message}</p>}
    <RecordFormControls busy={pending} disabled={processingPhoto || Boolean(photoError)} />
  </form>;
}
