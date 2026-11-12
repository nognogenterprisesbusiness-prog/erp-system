"use client";

import { useActionState } from "react";
import { archiveSupplierAction, type SupplierActionState } from "@/app/(workspace)/suppliers/actions";
import { fieldControlClass } from "@/components/ui/form-field";
import { RecordFormControls } from "@/components/ui/record-create-dialog";

const initialState: SupplierActionState = { ok: false, message: "" };

function FormMessage({ state }: { state: SupplierActionState }) {
  if (!state.message) return null;
  return <p role={state.ok ? "status" : "alert"} className={`text-xs font-medium ${state.ok ? "text-emerald-700" : "text-red-600"}`}>{state.message}</p>;
}

export function ArchiveSupplierForm({ supplierId }: { supplierId: string }) {
  const [state, action, pending] = useActionState(archiveSupplierAction, initialState);
  return <form action={action} className="grid gap-4">
    <input type="hidden" name="id" value={supplierId} />
    <p className="text-sm leading-6 text-slate-600">Remove this supplier from the active list. Their purchase records and history are kept.</p>
    <label className="grid gap-2 text-sm font-medium">Archive reason<textarea className={`${fieldControlClass} h-auto py-3`} name="reason" rows={3} placeholder="Explain why this supplier is being archived" minLength={3} maxLength={500} required disabled={pending} /></label>
    <FormMessage state={state} />
    <RecordFormControls busy={pending} label="Confirm archive" />
  </form>;
}
