"use client";

import { useActionState, useState } from "react";
import { approveTransferVarianceAction, type InventoryActionState } from "@/app/(workspace)/inventory/actions";
import { Button } from "@/components/ui/button";
import { FormField, fieldControlClass } from "@/components/ui/form-field";

const initialState: InventoryActionState = { ok: false, message: "" };

export function TransferVarianceForm({ itemId, remaining, unit, returnPath }: {
  itemId: string; remaining: number; unit: string; returnPath: string;
}) {
  const [state, action, pending] = useActionState(approveTransferVarianceAction, initialState);
  const [idempotencyKey] = useState(() => crypto.randomUUID());
  return <details className="mt-4 rounded-xl border border-amber-200 bg-amber-50/40 p-4">
    <summary className="cursor-pointer text-sm font-semibold text-amber-900">Approve missing or damaged quantity</summary>
    <form action={action} className="mt-4 grid gap-3 sm:grid-cols-[160px_1fr_auto] sm:items-end">
      <input type="hidden" name="idempotencyKey" value={idempotencyKey} />
      <input type="hidden" name="transferItemId" value={itemId} />
      <input type="hidden" name="returnPath" value={returnPath} />
      <FormField label={"Quantity (up to " + remaining + " " + unit + ")"} htmlFor={"variance-quantity-" + itemId} error={!state.ok ? state.fieldErrors?.quantity?.[0] : undefined}>
        <input id={"variance-quantity-" + itemId} name="quantity" type="number" min="0.0001" max={remaining} step="0.0001" inputMode="decimal" className={fieldControlClass} required />
      </FormField>
      <FormField label="Approval reason" htmlFor={"variance-reason-" + itemId} error={!state.ok ? state.fieldErrors?.reason?.[0] : undefined}>
        <input id={"variance-reason-" + itemId} name="reason" minLength={3} maxLength={500} placeholder="Damaged or missing in transit" className={fieldControlClass} required />
      </FormField>
      <Button type="submit" variant="outline" disabled={pending}>{pending ? "Approving…" : "Approve variance"}</Button>
      {!state.ok && state.message && <p role="alert" className="text-sm text-red-600 sm:col-span-3">{state.message}</p>}
    </form>
  </details>;
}
