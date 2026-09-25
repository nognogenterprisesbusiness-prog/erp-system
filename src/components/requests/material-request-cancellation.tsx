"use client";

import { useActionState, useState } from "react";
import { cancelMaterialRequestAction, type RequestActionState } from "@/app/(workspace)/requests/actions";
import { Button } from "@/components/ui/button";
import { FormField, fieldControlClass } from "@/components/ui/form-field";

const initialState: RequestActionState = { ok: false, message: "" };

export function MaterialRequestCancellation({ requestId }: { requestId: string }) {
  const [state, action, pending] = useActionState(cancelMaterialRequestAction, initialState);
  const [idempotencyKey] = useState(() => crypto.randomUUID());

  return <form action={action} className="rounded-xl border border-amber-200 bg-amber-50/60 p-5">
    <input type="hidden" name="requestId" value={requestId} />
    <input type="hidden" name="idempotencyKey" value={idempotencyKey} />
    <h2 className="text-base font-semibold text-slate-900">Cancel request</h2>
    <p className="mt-1 text-sm text-slate-600">Cancellation releases any stock reserved for this request. It is available only before the first dispatch.</p>
    <FormField label="Cancellation reason" htmlFor="cancellationReason" className="mt-4">
      <textarea id="cancellationReason" name="reason" className={`${fieldControlClass} h-auto py-3`} rows={2} minLength={3} maxLength={500} required />
    </FormField>
    {!state.ok && state.message && <p role="alert" className="mt-3 text-sm font-medium text-red-700">{state.message}</p>}
    <div className="mt-4 flex justify-end"><Button type="submit" variant="outline" disabled={pending}>{pending ? "Cancelling…" : "Cancel request"}</Button></div>
  </form>;
}
