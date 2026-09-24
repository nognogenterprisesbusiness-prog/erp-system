"use client";

import { useActionState, useState } from "react";
import { verifyOpeningValueAction, type InventoryActionState } from "@/app/(workspace)/inventory/actions";
import { Button } from "@/components/ui/button";
import { FormField, fieldControlClass } from "@/components/ui/form-field";

const initialState: InventoryActionState = { ok: false, message: "" };

export function OpeningValueForm({ materialId, locationId, quantity }: { materialId: string; locationId: string; quantity: number }) {
  const [state, action, pending] = useActionState(verifyOpeningValueAction, initialState);
  const [idempotencyKey] = useState(() => crypto.randomUUID());
  const valueId = "opening-value-" + locationId + "-" + materialId;
  const reasonId = "opening-reason-" + locationId + "-" + materialId;
  return <form action={action} className="grid gap-3 border-t border-slate-100 pt-4 sm:grid-cols-[180px_1fr_auto] sm:items-end">
    <input type="hidden" name="idempotencyKey" value={idempotencyKey} />
    <input type="hidden" name="materialId" value={materialId} />
    <input type="hidden" name="locationId" value={locationId} />
    <input type="hidden" name="quantity" value={quantity} />
    <FormField label="Verified total value (PHP)" htmlFor={valueId} error={!state.ok ? state.fieldErrors?.totalValue?.[0] : undefined}>
      <input className={fieldControlClass} id={valueId} name="totalValue" type="number" min="0" step="0.01" required />
    </FormField>
    <FormField label="Evidence / reconciliation reason" htmlFor={reasonId} error={!state.ok ? state.fieldErrors?.reason?.[0] : undefined}>
      <input className={fieldControlClass} id={reasonId} name="reason" minLength={3} maxLength={500} required placeholder="Count sheet or approved opening statement" />
    </FormField>
    <Button type="submit" disabled={pending}>{pending ? "Verifying…" : "Verify value"}</Button>
    {!state.ok && state.message && <p role="alert" className="text-sm text-red-600 sm:col-span-3">{state.message}</p>}
  </form>;
}
