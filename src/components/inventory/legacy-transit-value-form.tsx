"use client";

import { useActionState } from "react";
import { verifyLegacyTransitValueAction, type InventoryActionState } from "@/app/(workspace)/inventory/actions";
import { Button } from "@/components/ui/button";
import { FormField, fieldControlClass } from "@/components/ui/form-field";

const initialState: InventoryActionState = { ok: false, message: "" };

export function LegacyTransitValueForm({ transferItemId, idempotencyKey, receivedQuantity }: { transferItemId: string; idempotencyKey: string; receivedQuantity: number }) {
  const [state, action, pending] = useActionState(verifyLegacyTransitValueAction, initialState);
  const error = (field: string) => state.ok ? undefined : state.fieldErrors?.[field]?.[0];
  return <form action={action} className="grid gap-4 border-t border-slate-100 pt-4 sm:grid-cols-2">
    <input type="hidden" name="transferItemId" value={transferItemId} /><input type="hidden" name="idempotencyKey" value={idempotencyKey} />
    <FormField label="Verified dispatched total value (PHP)" htmlFor={`transit-dispatched-${transferItemId}`} error={error("dispatchedTotalCost")}><input id={`transit-dispatched-${transferItemId}`} name="dispatchedTotalCost" className={fieldControlClass} inputMode="decimal" required /></FormField>
    <FormField label="Verified already-received value (PHP)" htmlFor={`transit-received-${transferItemId}`} error={error("receivedTotalCost")} hint={receivedQuantity === 0 ? "Enter 0; nothing was received before valuation." : "Use the historical value of the quantity already received."}><input id={`transit-received-${transferItemId}`} name="receivedTotalCost" className={fieldControlClass} inputMode="decimal" defaultValue={receivedQuantity === 0 ? "0" : ""} required /></FormField>
    <FormField label="Supporting document reference" htmlFor={`transit-reference-${transferItemId}`} error={error("supportingReference")}><input id={`transit-reference-${transferItemId}`} name="supportingReference" className={fieldControlClass} maxLength={120} placeholder="Opening count / delivery note" required /></FormField>
    <FormField label="Reconciliation reason" htmlFor={`transit-reason-${transferItemId}`} error={error("reason")}><input id={`transit-reason-${transferItemId}`} name="reason" className={fieldControlClass} maxLength={500} required /></FormField>
    {!state.ok && state.message && <p role="alert" className="text-sm text-red-700 sm:col-span-2">{state.message}</p>}
    <div className="sm:col-span-2 flex justify-end"><Button type="submit" disabled={pending}>{pending ? "Verifying…" : "Verify transit value"}</Button></div>
  </form>;
}
