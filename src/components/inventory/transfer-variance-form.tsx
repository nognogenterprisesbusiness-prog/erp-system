"use client";

import { ActionDialog } from "@/components/ui/action-dialog";
import { useActionState, useState } from "react";
import { approveTransferVarianceAction, type InventoryActionState } from "@/app/(workspace)/inventory/actions";
import { RecordFormControls } from "@/components/ui/record-create-dialog";
import { FormField, fieldControlClass } from "@/components/ui/form-field";

const initialState: InventoryActionState = { ok: false, message: "" };

function VarianceForm({ itemId, remaining, unit, returnPath }: {
  itemId: string; remaining: number; unit: string; returnPath: string; expanded?: boolean;
}) {
  const [state, action, pending] = useActionState(approveTransferVarianceAction, initialState);
  const [idempotencyKey] = useState(() => crypto.randomUUID());
  return <form action={action} className="mt-4 grid gap-3 sm:grid-cols-2 sm:items-end">
      <input type="hidden" name="idempotencyKey" value={idempotencyKey} />
      <input type="hidden" name="transferItemId" value={itemId} />
      <input type="hidden" name="returnPath" value={returnPath} />
      <FormField label={"Quantity (up to " + remaining + " " + unit + ")"} htmlFor={"variance-quantity-" + itemId} error={!state.ok ? state.fieldErrors?.quantity?.[0] : undefined}>
        <input id={"variance-quantity-" + itemId} name="quantity" type="number" min="0.0001" max={remaining} step="0.0001" inputMode="decimal" className={fieldControlClass} required />
      </FormField>
      <FormField label="Approval reason" htmlFor={"variance-reason-" + itemId} error={!state.ok ? state.fieldErrors?.reason?.[0] : undefined}>
        <input id={"variance-reason-" + itemId} name="reason" minLength={3} maxLength={500} placeholder="Damaged or missing in transit" className={fieldControlClass} required />
      </FormField>
      <div className="sm:col-span-2"><RecordFormControls busy={pending} success={state.ok} label="Approve variance" /></div>
      {!state.ok && state.message && <p role="alert" className="text-sm text-red-600 sm:col-span-2">{state.message}</p>}
    </form>;
}

export function TransferVarianceForm(props: Parameters<typeof VarianceForm>[0]) {
  if (props.expanded) return <VarianceForm {...props} />;
  return <ActionDialog retainDraft title="Approve missing or damaged quantity" description="Review the missing or damaged quantity and record why the variance is approved."><VarianceForm {...props} /></ActionDialog>;
}
