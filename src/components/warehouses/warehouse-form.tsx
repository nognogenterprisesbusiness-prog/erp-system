"use client";
import { useActionState, useState } from "react";
import Link from "next/link";
import { saveWarehouseAction, type WarehouseActionState } from "@/app/(workspace)/warehouses/actions";
import { RecordFormControls } from "@/components/ui/record-create-dialog";
import { RecordPhotoInput } from "@/components/ui/record-photo-input";
import { LocationPicker } from "@/components/ui/location-picker";
import { SelectPicker } from "@/components/ui/select-picker";
import { recordPhotoUrl } from "@/lib/media/record-photo-url";
import type { WarehouseRow } from "@/types/database";

const initialState: WarehouseActionState = { ok: false, message: "" };
const inputClass = "h-11 w-full rounded-lg border border-slate-200 bg-white px-3 text-sm outline-none focus:border-cyan-600 focus:ring-4 focus:ring-cyan-600/10";
export function WarehouseForm({ warehouse, municipalityLabel = "" }: { warehouse?: WarehouseRow; municipalityLabel?: string }) {
  const [state, action, pending] = useActionState(saveWarehouseAction, initialState);
  const [photoBusy, setPhotoBusy] = useState(false);
  const [status, setStatus] = useState(warehouse?.status ?? "active");
  const fields = !state.ok ? state.fieldErrors : undefined;
  const field = (label: string, name: string, input: React.ReactNode) => <label htmlFor={name} className="space-y-2 text-sm font-medium text-slate-700"><span>{label}</span>{input}{fields?.[name]?.[0] && <span className="block text-xs text-red-600">{fields[name][0]}</span>}</label>;
  return <form action={action} className="rounded-2xl border border-slate-200 bg-white p-5 sm:p-6">{warehouse && <input type="hidden" name="id" value={warehouse.id} />}<div className="grid gap-5 md:grid-cols-2">
    {field("Warehouse code", "code", <input id="code" name="code" className={inputClass} defaultValue={warehouse?.code} placeholder="WH-CEBU-01" required />)}
    {field("Warehouse name", "name", <input id="name" name="name" className={inputClass} defaultValue={warehouse?.name} required />)}
    <div className="md:col-span-2"><RecordPhotoInput label="Warehouse photo" currentPhoto={warehouse?.photo_path ? recordPhotoUrl("warehouses", warehouse.id) : undefined} convertBeforeSubmit onProcessingChange={setPhotoBusy} /></div>
    <div><LocationPicker initialCode={warehouse?.municipality_code ?? ""} initialLabel={municipalityLabel} />{fields?.municipalityCode?.[0] && <p className="mt-1 text-xs text-red-600">{fields.municipalityCode[0]}</p>}</div>
    <div className="md:col-span-2">{field("Address", "address", <input id="address" name="address" className={inputClass} defaultValue={warehouse?.address} required />)}</div>
    {field("Contact person", "contactPerson", <input id="contactPerson" name="contactPerson" className={inputClass} defaultValue={warehouse?.contact_person ?? ""} />)}
    {field("Contact number", "contactNumber", <input id="contactNumber" name="contactNumber" className={inputClass} defaultValue={warehouse?.contact_number ?? ""} />)}
    <div>
      {field("Status", "status", <SelectPicker
        label="Status"
        name="status"
        value={status}
        onValueChange={(value) => { if (value === "active" || value === "inactive") setStatus(value); }}
        options={[{ value: "active", label: "Active" }, { value: "inactive", label: "Inactive" }]}
      />)}
      {warehouse && status === "inactive" && <p className="mt-2 text-xs leading-5 text-slate-500">
        Move or reconcile all stock, finish in-flight transfers, and receive or cancel open purchase orders before marking this warehouse inactive. Its history will remain available.
      </p>}
    </div>
    <div className="md:col-span-2">{field("Description", "description", <textarea id="description" name="description" rows={4} className={`${inputClass} h-auto py-3`} defaultValue={warehouse?.description ?? ""} />)}</div>
  </div>{!state.ok && state.message && <p role="alert" className="mt-5 text-sm font-medium text-red-600">{state.message}</p>}{state.ok && "message" in state && <p role="status" className="mt-5 text-sm text-amber-700">{state.message} <Link className="underline" href={`/warehouses/${state.data.id}`}>Open saved warehouse</Link></p>}<RecordFormControls busy={pending || photoBusy} /></form>;
}
