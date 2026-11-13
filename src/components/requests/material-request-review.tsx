"use client";

import { useActionState, useState, type ComponentProps } from "react";
import { decideMaterialRequestAction, type RequestActionState } from "@/app/(workspace)/requests/actions";
import { MaterialRequestItems } from "./material-request-items";
import { MaterialRequestCancellation } from "./material-request-cancellation";
import { RecordCreateDialog, RecordFormControls } from "@/components/ui/record-create-dialog";
import { Button } from "@/components/ui/button";
import { FormField, fieldControlClass } from "@/components/ui/form-field";

export function MaterialRequestReview({ items, canDecide, canCancel, initialMode }: {
  items: ComponentProps<typeof MaterialRequestItems>; canDecide: boolean; canCancel: boolean;
  initialMode: string | undefined;
}) {
  const [mode, setMode] = useState(canDecide && initialMode === "approve" ? "approve" : "view");
  const [pending, setPending] = useState(false);
  const [dialog, setDialog] = useState<"reject" | "cancel" | null>(canDecide && initialMode === "reject" ? "reject" : null);
  return <>
    {(canDecide || canCancel) && <div className="mt-3 flex flex-wrap items-center justify-between gap-2">
      <p className="text-sm font-semibold">{mode === "approve" ? "Approve request" : "Request actions"}</p>
      <div className="flex flex-wrap items-center gap-2">
        {canDecide && <>
          {mode === "approve" ? <Button variant="outline" size="sm" disabled={pending} onClick={() => setMode("view")}>View</Button> : <Button size="sm" onClick={() => setMode("approve")}>Approve</Button>}
          <Button variant="outline" size="sm" disabled={pending} className="text-red-700 hover:bg-red-50" onClick={() => setDialog("reject")}>Reject</Button>
        </>}
        {canCancel && <Button variant="outline" size="sm" disabled={pending} onClick={() => setDialog("cancel")}>Cancel request</Button>}
      </div>
    </div>}
    <MaterialRequestItems key={`${items.requestId}:${items.defaultWarehouseId}:${mode}`} {...items} canDecide={canDecide && mode === "approve"} onReject={() => setDialog("reject")} onPendingChange={setPending} />
    {dialog && <RecordCreateDialog key={dialog} title={dialog === "reject" ? "Reject request" : "Cancel request"} initialOpen hideTrigger onClosed={() => setDialog(null)}>
      {dialog === "reject" ? <RequestRejection requestId={items.requestId} lineIds={items.lines.map(line => line.id)} /> : <MaterialRequestCancellation requestId={items.requestId} />}
    </RecordCreateDialog>}
  </>;
}

function RequestRejection({ requestId, lineIds }: { requestId: string; lineIds: string[] }) {
  const [state, action, pending] = useActionState(decideMaterialRequestAction, { ok: false, message: "" } as RequestActionState);
  const [key] = useState(() => crypto.randomUUID());
  return <form action={action} aria-busy={pending}>
    <p className="mb-5 text-sm text-slate-600">Reject all materials in this request? No stock will be reserved or released.</p>
    <input type="hidden" name="requestId" value={requestId} /><input type="hidden" name="idempotencyKey" value={key} />
    <input type="hidden" name="decisions" value={JSON.stringify(Object.fromEntries(lineIds.map(id => [id, "0"])))} />
    <input type="hidden" name="allocations" value={JSON.stringify(Object.fromEntries(lineIds.map(id => [id, []])))} />
    <FormField label="Rejection reason" htmlFor="rejectionReason"><textarea id="rejectionReason" name="reason" className={`${fieldControlClass} h-auto py-3`} rows={3} minLength={3} maxLength={500} required disabled={pending} /></FormField>
    {!state.ok && state.message && <p role="alert" className="mt-3 text-sm text-red-700">{state.message}</p>}
    <RecordFormControls busy={pending} label="Confirm rejection" />
  </form>;
}
