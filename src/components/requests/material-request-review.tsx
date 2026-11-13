"use client";

import { useActionState, useState, type ComponentProps, type ReactNode } from "react";
import { decideMaterialRequestAction, type RequestActionState } from "@/app/(workspace)/requests/actions";
import { MaterialRequestItems } from "./material-request-items";
import { MaterialRequestCancellation } from "./material-request-cancellation";
import { RecordActionMenu } from "@/components/ui/record-action-menu";
import { RecordCreateDialog, RecordFormControls } from "@/components/ui/record-create-dialog";
import { Button } from "@/components/ui/button";
import { FormField, fieldControlClass } from "@/components/ui/form-field";

export function MaterialRequestReview({ items, canDecide, canCancel, warehouseForm, initialMode }: {
  items: ComponentProps<typeof MaterialRequestItems>; canDecide: boolean; canCancel: boolean;
  warehouseForm: ReactNode; initialMode: string | undefined;
}) {
  const [mode, setMode] = useState(canDecide && initialMode === "approve" ? "approve" : "view");
  const [dialog, setDialog] = useState<"reject" | "cancel" | null>(canDecide && initialMode === "reject" ? "reject" : null);
  return <>
    {(canDecide || canCancel) && <div className="mt-5 flex items-center justify-between gap-3 rounded-xl border border-slate-200 bg-white p-4">
      <p className="text-sm font-semibold">{mode === "approve" ? "Approve request" : "Request actions"}</p>
      <div className="flex items-center gap-2">{mode === "approve" && <Button variant="outline" size="sm" onClick={() => setMode("view")}>Back to view</Button>}
        <RecordActionMenu name="material request" actions={[
          ...(canDecide ? [{ label: "Approve", onSelect: () => setMode("approve") }, { label: "Reject", destructive: true, onSelect: () => setDialog("reject") }] : []),
          ...(canCancel ? [{ label: "Cancel request", destructive: true, onSelect: () => setDialog("cancel") }] : []),
        ]} />
      </div>
    </div>}
    {mode === "approve" && canDecide && warehouseForm}
    <MaterialRequestItems key={`${items.requestId}:${items.defaultWarehouseId}:${mode}`} {...items} canDecide={canDecide && mode === "approve"} onReject={() => setDialog("reject")} />
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
