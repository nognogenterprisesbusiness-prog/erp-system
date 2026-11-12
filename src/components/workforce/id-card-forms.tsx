"use client";

import { RecordFormControls } from "@/components/ui/record-create-dialog";
import { useActionState } from "react";
import { Button } from "@/components/ui/button";
import { FormField, fieldControlClass } from "@/components/ui/form-field";
import { replaceIdCardAction, type IdCardActionState } from "./id-card-actions";

const initial: IdCardActionState = { message: "" };

export function ReplaceIdCardForm({ employeeId }: { employeeId: string }) {
  const [state, action, pending] = useActionState(replaceIdCardAction, initial);
  return <form action={action} className="grid gap-3">
    <input type="hidden" name="employeeId" value={employeeId} />
    <p className="text-sm text-slate-600">Use this when a card is lost or damaged. The old card stops working immediately.</p>
    <FormField label="Reason" htmlFor="replaceCardReason"><input id="replaceCardReason" name="reason" required minLength={3} maxLength={500} placeholder="e.g. Lost card" className={fieldControlClass} /></FormField>
    <RecordFormControls busy={pending} disabled={state.ok} label="Issue new card" />
    {state.message && <p role={state.ok ? "status" : "alert"} className={`text-sm ${state.ok ? "text-emerald-700" : "text-red-700"}`}>{state.message}</p>}
  </form>;
}

export function PrintCardsButton({ label = "Print" }: { label?: string }) {
  return <Button type="button" onClick={() => window.print()}>{label}</Button>;
}
