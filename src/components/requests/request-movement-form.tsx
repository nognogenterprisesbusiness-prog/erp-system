"use client";

import { ActionDialog } from "@/components/ui/action-dialog";
import { useActionState, useEffect, useRef, useState } from "react";
import { dispatchRequestLineAction, receiveRequestTransferAction, type RequestActionState } from "@/app/(workspace)/requests/actions";
import { useRecordDialog, RecordFormControls } from "@/components/ui/record-create-dialog";
import { FormField, fieldControlClass } from "@/components/ui/form-field";
import { todayInManila } from "@/lib/date";
import { PagedReferencePicker } from "@/components/ui/paged-reference-picker";
import { SelectPicker } from "@/components/ui/select-picker";

const initialState: RequestActionState = { ok: false, message: "" };

function MovementForm({ mode, id, requestId, remaining, unit, expanded = false, vehicles = [] }: {
  mode: "dispatch" | "receive"; id: string; requestId?: string; remaining: number; unit: string; expanded?: boolean;
  vehicles?: { id: string; label: string }[];
}) {
  const [state, action, pending] = useActionState(mode === "dispatch" ? dispatchRequestLineAction : receiveRequestTransferAction, initialState);
  const dialog = useRecordDialog();
  const complete = dialog?.complete;
  const completed = useRef(false);
  useEffect(() => { if (pending) { completed.current = false; return; } if (state.ok && !completed.current) { completed.current = true; complete?.(); } }, [state, pending, complete]);
  const [key] = useState(() => crypto.randomUUID());
  const [vehicleId, setVehicleId] = useState("");
  const [companyTransport, setCompanyTransport] = useState(false);
  const [condition, setCondition] = useState<"accepted" | "accepted_with_note">("accepted");
  const label = mode === "dispatch" ? "Release materials" : "Confirm receipt";
  const form = <form action={action} className="mt-4 grid gap-4 sm:grid-cols-2">
      <input type="hidden" name="idempotencyKey" value={key} />
      <input type="hidden" name={mode === "dispatch" ? "allocationId" : "transferItemId"} value={id} />
      {requestId && <input type="hidden" name="requestId" value={requestId} />}
      <FormField label={`Quantity (up to ${remaining} ${unit})`} htmlFor={`${mode}-qty-${id}`} error={!state.ok ? state.fieldErrors?.quantity?.[0] : undefined}>
        <input id={`${mode}-qty-${id}`} name="quantity" type="number" min="0.0001" max={remaining} step="0.0001" inputMode="decimal" className={fieldControlClass} required />
      </FormField>
      <FormField label={mode === "dispatch" ? "Dispatch date" : "Receipt date"} htmlFor={`${mode}-date-${id}`}>
        <input id={`${mode}-date-${id}`} name="transactionDate" type="date" defaultValue={todayInManila()} className={fieldControlClass} required />
      </FormField>
      <FormField label="Note (optional)" htmlFor={`${mode}-note-${id}`}>
        <input id={`${mode}-note-${id}`} name="remarks" maxLength={500} className={fieldControlClass} />
      </FormField>
      {mode === "dispatch" && <>
        <input type="hidden" name="vehicleAssetId" value={vehicleId} />
        <FormField label="Delivery vehicle" htmlFor={`vehicle-${id}`} hint="Choose Company vehicle and select it below, or choose Other / external transport and describe it.">
          <SelectPicker id={`vehicle-${id}`} label="Transport type" value={companyTransport ? "company" : "other"} onValueChange={(next) => { setCompanyTransport(next === "company"); setVehicleId(""); }} options={[{ value: "other", label: "Other / external transport" }, { value: "company", label: "Company vehicle" }]} />
          {companyTransport && <PagedReferencePicker kind="delivery_vehicle" label="Delivery vehicle" value={vehicleId} onValueChange={setVehicleId} initialOptions={vehicles.map((item) => ({ value: item.id, label: item.label }))} />}
        </FormField>
        {!vehicleId && <FormField label="Vehicle or transport description" htmlFor={`vehicle-label-${id}`}><input id={`vehicle-label-${id}`} name="vehicleLabel" className={fieldControlClass} maxLength={120} placeholder="Plate number or transport type" required /></FormField>}
        <FormField label="Driver" htmlFor={`driver-${id}`}><input id={`driver-${id}`} name="driverName" className={fieldControlClass} maxLength={120} required /></FormField>
        <FormField label="Delivery reference" htmlFor={`delivery-ref-${id}`}><input id={`delivery-ref-${id}`} name="deliveryReference" className={fieldControlClass} maxLength={120} placeholder="Trip or delivery receipt number" required /></FormField>
      </>}
      {mode === "receive" && <>
        <input type="hidden" name="condition" value={condition} />
        <FormField label="Material check" htmlFor={`condition-${id}`}>
          <SelectPicker id={`condition-${id}`} label="Material check" value={condition} onValueChange={(next) => setCondition(next as typeof condition)} options={[{ value: "accepted", label: "Quantity and condition accepted" }, { value: "accepted_with_note", label: "Accepted with quality note" }]} />
        </FormField>
        {condition === "accepted_with_note" && <FormField label="Quality note" htmlFor={`quality-note-${id}`}><input id={`quality-note-${id}`} name="qualityNote" className={fieldControlClass} maxLength={500} placeholder="Describe the issue with accepted stock" required /></FormField>}
        <p className="text-xs text-slate-500 sm:col-span-2">Enter only the usable quantity. Report damaged or missing pieces to Admin.</p>
      </>}
      <div className="col-span-full">
        <RecordFormControls busy={pending} disabled={mode === "dispatch" && companyTransport && !vehicleId} label={label} />
      </div>
      {state.ok && <p role="status" className="text-sm text-emerald-700 sm:col-span-2">{mode === "dispatch" ? "Materials released." : "Receipt recorded."}</p>}
      {!state.ok && state.message && <p role="alert" className="text-sm text-red-600 sm:col-span-2">{state.message}</p>}
    </form>;
  if (expanded && dialog) return form;
  if (expanded) return <section className="rounded-xl border border-slate-200 bg-white p-5"><h2 className="text-base font-semibold text-slate-900">{label}</h2>{form}</section>;
  return form;
}

export function RequestMovementForm(props: Parameters<typeof MovementForm>[0]) {
  if (props.expanded) return <MovementForm {...props} />;
  const title = props.mode === "dispatch" ? "Release materials" : "Confirm receipt";
  return <ActionDialog retainDraft title={title} description={props.mode === "dispatch" ? "Enter the quantity leaving the warehouse and its delivery details." : "Enter only the usable quantity actually received at the site."}><MovementForm {...props} expanded /></ActionDialog>;
}
