"use client";

import { useActionState, useEffect, useRef, useState } from "react";
import { dispatchRequestLineAction, receiveRequestTransferAction, type RequestActionState } from "@/app/(workspace)/requests/actions";
import { useRouter } from "next/navigation";
import { useRecordDialog, RecordFormControls } from "@/components/ui/record-create-dialog";
import { FormField, fieldControlClass } from "@/components/ui/form-field";
import { todayInManila } from "@/lib/date";
import { PagedReferencePicker } from "@/components/ui/paged-reference-picker";
import { SelectPicker } from "@/components/ui/select-picker";

const initialState: RequestActionState = { ok: false, message: "" };

export function RequestMovementForm({ mode, id, requestId, remaining, unit, expanded = false, vehicles = [] }: {
  mode: "dispatch" | "receive"; id: string; requestId?: string; remaining: number; unit: string; expanded?: boolean;
  vehicles?: { id: string; label: string }[];
}) {
  const [state, action, pending] = useActionState(mode === "dispatch" ? dispatchRequestLineAction : receiveRequestTransferAction, initialState);
  const dialog = useRecordDialog();
  const router = useRouter();
  const complete = dialog?.complete;
  const completed = useRef(false);
  useEffect(() => { if (pending) { completed.current = false; return; } if (state.ok && !completed.current) { completed.current = true; if (complete) complete(); else router.refresh(); } }, [state, pending, complete, router]);
  const [key] = useState(() => crypto.randomUUID());
  const [vehicleId, setVehicleId] = useState("");
  const [companyTransport, setCompanyTransport] = useState(false);
  const [condition, setCondition] = useState<"accepted" | "accepted_with_note">("accepted");
  const label = mode === "dispatch" ? "Release materials" : "Confirm receipt";
  const form = <form action={action} className="mt-4 grid gap-3 sm:grid-cols-2 lg:grid-cols-[1fr_1fr_1.5fr_auto] lg:items-end">
      <input type="hidden" name="idempotencyKey" value={key} />
      <input type="hidden" name={mode === "dispatch" ? "requestLineId" : "transferItemId"} value={id} />
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
        <FormField label="Delivery vehicle" htmlFor={`vehicle-${id}`}>
          <SelectPicker label="Transport type" value={companyTransport ? "company" : "other"} onValueChange={(next) => { setCompanyTransport(next === "company"); setVehicleId(""); }} options={[{ value: "other", label: "Other / external transport" }, { value: "company", label: "Company vehicle" }]} />
          {companyTransport && <PagedReferencePicker kind="delivery_vehicle" label="Delivery vehicle" value={vehicleId} onValueChange={setVehicleId} initialOptions={vehicles.map((item) => ({ value: item.id, label: item.label }))} />}
        </FormField>
        {!vehicleId && <FormField label="Vehicle or transport description" htmlFor={`vehicle-label-${id}`}><input id={`vehicle-label-${id}`} name="vehicleLabel" className={fieldControlClass} maxLength={120} placeholder="Plate number or transport type" required /></FormField>}
        <FormField label="Driver" htmlFor={`driver-${id}`}><input id={`driver-${id}`} name="driverName" className={fieldControlClass} maxLength={120} required /></FormField>
        <FormField label="Delivery reference" htmlFor={`delivery-ref-${id}`}><input id={`delivery-ref-${id}`} name="deliveryReference" className={fieldControlClass} maxLength={120} placeholder="Trip or delivery receipt number" required /></FormField>
      </>}
      {mode === "receive" && <>
        <input type="hidden" name="condition" value={condition} />
        <FormField label="Material check" htmlFor={`condition-${id}`}>
          <SelectPicker label="Material check" value={condition} onValueChange={(next) => setCondition(next as typeof condition)} options={[{ value: "accepted", label: "Quantity and condition accepted" }, { value: "accepted_with_note", label: "Accepted with quality note" }]} />
        </FormField>
        {condition === "accepted_with_note" && <FormField label="Quality note" htmlFor={`quality-note-${id}`}><input id={`quality-note-${id}`} name="qualityNote" className={fieldControlClass} maxLength={500} placeholder="Describe the issue with accepted stock" required /></FormField>}
        <p className="text-xs text-slate-500 sm:col-span-2 lg:col-span-4">Enter only the usable quantity. Report damaged or missing pieces to Admin.</p>
      </>}
      <RecordFormControls busy={pending} disabled={mode === "dispatch" && companyTransport && !vehicleId} label={label} />
      {state.ok && <p role="status" className="text-sm text-emerald-700 sm:col-span-2 lg:col-span-4">{mode === "dispatch" ? "Materials released." : "Receipt recorded."}</p>}
      {!state.ok && state.message && <p role="alert" className="text-sm text-red-600 sm:col-span-2 lg:col-span-4">{state.message}</p>}
    </form>;
  if (expanded && dialog) return form;
  if (expanded) return <section className="rounded-xl border border-slate-200 bg-white p-5"><h2 className="text-base font-semibold text-slate-900">{label}</h2>{form}</section>;
  return <details className="group rounded-xl border border-slate-200 bg-white p-4"><summary className="cursor-pointer text-sm font-semibold text-cyan-800 focus-visible:outline-cyan-700">{label}</summary>{form}</details>;
}
