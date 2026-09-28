"use client";
import { startTransition, useActionState, useEffect, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { saveMaterialAction, type MaterialActionState } from "@/app/(workspace)/materials/actions";
import { RecordFormControls, useRecordDialog } from "@/components/ui/record-create-dialog";
import { FormField, fieldControlClass } from "@/components/ui/form-field";
import { RecordPhotoInput } from "@/components/ui/record-photo-input";
import { SelectPicker } from "@/components/ui/select-picker";
import { recordPhotoUrl } from "@/lib/media/record-photo-url";
import type { MaterialCategoryRow, MaterialRow, UnitRow } from "@/types/database";

const initialState: MaterialActionState = { ok: false, message: "" };
export function MaterialForm({ material, categories, units }: { material?: MaterialRow; categories: MaterialCategoryRow[]; units: UnitRow[] }) {
  const [state, action, pending] = useActionState(saveMaterialAction, initialState);
  const [processingPhoto, setProcessingPhoto] = useState(false);
  const dialog = useRecordDialog();
  const router = useRouter();
  const completed = useRef(false);
  useEffect(() => {
    if (!state.ok || completed.current) return;
    completed.current = true;
    // Editing closes the dialog in place; a new material opens its record.
    if (material && dialog) dialog.complete();
    else startTransition(() => router.replace(`/materials/${state.data.id}`));
  }, [state, material, dialog, router]);
  const error = (field: string) => state.ok ? undefined : state.fieldErrors?.[field]?.[0];
  if (material?.material_kind === "reusable") return <div className="rounded-xl border border-slate-200 bg-white p-5 text-sm"><p className="font-semibold">Legacy reusable material · read-only</p><p className="mt-2 text-slate-500">An Admin must reconcile existing stock and value before registering these tools in Equipment. Historical records are preserved; no automatic conversion is performed.</p></div>;
  return <form action={action} className={dialog ? undefined : "rounded-xl border border-slate-200 bg-white p-5 sm:p-6"}>
    {material && <input type="hidden" name="id" value={material.id} />}
    <div className="grid gap-5 md:grid-cols-2">
      <FormField label="SKU / material code" htmlFor="code" error={error("code")}><input className={fieldControlClass} id="code" name="code" defaultValue={material?.code} placeholder="MAT-CEMENT" required /></FormField>
      <FormField label="Material name" htmlFor="name" error={error("name")}><input className={fieldControlClass} id="name" name="name" defaultValue={material?.name} required /></FormField>
      <FormField label="Category" htmlFor="categoryId" error={error("categoryId")}><SelectPicker id="categoryId" name="categoryId" label="Category" defaultValue={material?.category_id} required placeholder="Select category" options={categories.map((item) => ({ value: item.id, label: item.name }))} /></FormField>
      <FormField label="Base unit" htmlFor="baseUnitId" hint="Posted inventory must use this exact unit; changing it does not convert quantities." error={error("baseUnitId")}><SelectPicker label="Base unit" name="baseUnitId" defaultValue={material?.base_unit_id} placeholder="Select unit" options={units.map((item) => ({ value: item.id, label: `${item.name} (${item.symbol})` }))} /></FormField>
      <input type="hidden" name="materialKind" value="consumable" />
      <p className="self-center text-sm text-slate-500">Consumable materials only. Register reusable tools in Equipment for handover and return tracking.</p>
      <FormField label="Minimum stock level" htmlFor="minimumStockLevel" error={error("minimumStockLevel")}><input className={fieldControlClass} id="minimumStockLevel" name="minimumStockLevel" inputMode="decimal" defaultValue={material?.minimum_stock_level ?? "0"} required /></FormField>
      <FormField label="Status" htmlFor="isActive"><SelectPicker id="isActive" name="isActive" label="Status" defaultValue={String(material?.is_active ?? true)} options={[{ value: "true", label: "Active" }, { value: "false", label: "Inactive" }]} /></FormField>
      <FormField label="Description" htmlFor="description" className="md:col-span-2" error={error("description")}><textarea className={`${fieldControlClass} h-auto py-3`} id="description" name="description" rows={4} defaultValue={material?.description ?? ""} /></FormField>
      <div className="md:col-span-2 max-w-sm"><RecordPhotoInput label="Material photo (optional)" currentPhoto={material?.photo_path ? recordPhotoUrl("materials", material.id) : undefined} convertBeforeSubmit onProcessingChange={setProcessingPhoto} /></div>
    </div>
    {!state.ok && state.message && <p className="mt-5 text-sm font-medium text-red-600" role="alert">{state.message}</p>}
    <RecordFormControls busy={pending || processingPhoto} />
  </form>;
}
