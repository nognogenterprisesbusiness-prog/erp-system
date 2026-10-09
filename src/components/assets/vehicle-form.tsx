"use client";

import { startTransition, useActionState, useEffect, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { saveAssetAction, type AssetActionState } from "@/app/(workspace)/equipment/actions";
import { FormField, fieldControlClass } from "@/components/ui/form-field";
import { RecordFormControls, useRecordDialog } from "@/components/ui/record-create-dialog";
import { RecordPhotoInput } from "@/components/ui/record-photo-input";
import { SelectPicker } from "@/components/ui/select-picker";
import { recordPhotoUrl } from "@/lib/media/record-photo-url";
import type { AssetLocationView, AssetView } from "@/lib/data/assets";

const initialState: AssetActionState = { ok: false, message: "" };

export function VehicleForm({ asset, locations }: { asset?: AssetView; locations: AssetLocationView[] }) {
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
    else startTransition(() => router.replace(`/vehicles/${state.data.id}`));
  }, [state, dialog, router]);
  const error = (field: string) => state.ok ? undefined : state.fieldErrors?.[field]?.[0];
  return <form onSubmit={(event) => {
    event.preventDefault();
    if (pending || processingPhoto || photoError) return;
    const form = new FormData(event.currentTarget);
    if (photo.current) form.set("photo", photo.current);
    startTransition(() => action(form));
  }} className={dialog ? undefined : "rounded-xl border border-slate-200 bg-white p-5 sm:p-6"}>
    <input type="hidden" name="assetKind" value="vehicle" />
    <input type="hidden" name="id" value={state.savedId ?? asset?.id ?? ""} />
    <div className="grid gap-5 md:grid-cols-2">
      <FormField label="Vehicle name" htmlFor="name" error={error("name")}><input className={fieldControlClass} id="name" name="name" defaultValue={asset?.name} placeholder="e.g. Delivery truck 1" maxLength={160} required /></FormField>
      <FormField label="Vehicle type" htmlFor="vehicleType" error={error("vehicleType")}><input className={fieldControlClass} id="vehicleType" name="vehicleType" defaultValue={asset?.vehicle?.vehicle_type} placeholder="e.g. Dump truck, pickup or van" maxLength={120} required /></FormField>
      <FormField label="Plate number" htmlFor="plateNumber" error={error("plateNumber")}><input className={fieldControlClass} id="plateNumber" name="plateNumber" defaultValue={asset?.vehicle?.plate_number} maxLength={20} required /></FormField>
      <FormField label="Current location" htmlFor="currentLocationId" error={error("currentLocationId")}><SelectPicker id="currentLocationId" name="currentLocationId" label="Current location" defaultValue={asset?.current_location_id} placeholder="Select location" required options={locations.map((item) => ({ value: item.id, label: item.displayName }))} /></FormField>
    </div>
    <details className="mt-5 rounded-xl border border-slate-200 p-4">
      <summary className="cursor-pointer text-sm font-medium text-slate-700">More details (optional)</summary>
      <div className="mt-4 grid gap-5 md:grid-cols-2">
        <FormField label="Vehicle code" htmlFor="code" hint="Leave blank to create one automatically." error={error("code")}><input className={fieldControlClass} id="code" name="code" defaultValue={asset?.code} maxLength={32} placeholder="VEH-0001" /></FormField>
        <FormField label="Ownership" htmlFor="ownershipType" error={error("ownershipType")}><SelectPicker id="ownershipType" name="ownershipType" label="Ownership" defaultValue={asset?.ownership_type ?? "company_owned"} options={[{ value: "company_owned", label: "Company owned" }, { value: "rented", label: "Rented" }, { value: "leased", label: "Leased" }]} /></FormField>
        <FormField label="Status" htmlFor="status" error={error("status")}><SelectPicker id="status" name="status" label="Vehicle status" defaultValue={asset?.status ?? "available"} options={[{ value: "available", label: "Available" }, { value: "under_maintenance", label: "Under maintenance" }, { value: "out_of_service", label: "Out of service" }]} /></FormField>
        <FormField label="Notes" htmlFor="conditionNotes" className="md:col-span-2" error={error("conditionNotes")}><textarea className={`${fieldControlClass} h-auto py-3`} id="conditionNotes" name="conditionNotes" rows={3} maxLength={2000} defaultValue={asset?.condition_notes ?? ""} /></FormField>
        <div className="md:col-span-2"><RecordPhotoInput label="Vehicle photo" currentPhoto={asset?.photo_path ? recordPhotoUrl("assets", asset.id, asset.updated_at) : undefined} convertBeforeSubmit onProcessingChange={setProcessingPhoto} onPreparedFile={(file) => { photo.current = file; }} onPreparationError={setPhotoError} /></div>
      </div>
    </details>
    {!state.ok && state.message && <p role="alert" className="mt-5 text-sm font-medium text-red-600">{state.message}</p>}
    <RecordFormControls busy={pending} disabled={processingPhoto || Boolean(photoError)} />
  </form>;
}
