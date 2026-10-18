"use client";

import { useActionState, useState } from "react";
import { closeRequestRemainderAction, type RequestActionState } from "@/app/(workspace)/requests/actions";
import { Button } from "@/components/ui/button";
import { FormField, fieldControlClass } from "@/components/ui/form-field";

const initialState: RequestActionState = { ok: false, message: "" };

export function RequestRemainderClosure({ requestId }: { requestId: string }) {
  const [state, action, pending] = useActionState(closeRequestRemainderAction, initialState);
  const [idempotencyKey] = useState(() => crypto.randomUUID());

  return <form action={action} className="mt-5 rounded-xl border border-amber-200 bg-amber-50/60 p-5">
    <input type="hidden" name="requestId" value={requestId} />
    <input type="hidden" name="idempotencyKey" value={idempotencyKey} />
    <h2 className="text-base font-semibold text-slate-900">Close remaining quantity</h2>
    <p className="mt-1 text-sm text-slate-600">Use this when the rest of a partly released request will not be sent. It frees the stock still reserved so others can use it. Anything already released or received is not changed.</p>
    <FormField label="Reason" htmlFor="remainderReason" className="mt-4">
      <textarea id="remainderReason" name="reason" className={`${fieldControlClass} h-auto py-3`} rows={2} minLength={3} maxLength={500} required />
    </FormField>
    {!state.ok && state.message && <p role="alert" className="mt-3 text-sm font-medium text-red-700">{state.message}</p>}
    <div className="mt-4 flex justify-end"><Button type="submit" variant="outline" disabled={pending}>{pending ? "Closing…" : "Close remaining quantity"}</Button></div>
  </form>;
}
