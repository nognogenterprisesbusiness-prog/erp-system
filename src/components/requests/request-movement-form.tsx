"use client";

import { useActionState, useEffect, useRef, useState } from "react";
import { dispatchRequestLineAction, receiveRequestTransferAction, type RequestActionState } from "@/app/(workspace)/requests/actions";
import { useRouter } from "next/navigation";
import { useRecordDialog, RecordFormControls } from "@/components/ui/record-create-dialog";
import { FormField, fieldControlClass } from "@/components/ui/form-field";
import { todayInManila } from "@/lib/date";

const initialState: RequestActionState = { ok: false, message: "" };

export function RequestMovementForm({ mode, id, requestId, remaining, unit, expanded = false }: {
  mode: "dispatch" | "receive"; id: string; requestId?: string; remaining: number; unit: string; expanded?: boolean;
}) {
  const [state, action, pending] = useActionState(mode === "dispatch" ? dispatchRequestLineAction : receiveRequestTransferAction, initialState);
  const dialog = useRecordDialog();
  const router = useRouter();
  const complete = dialog?.complete;
  const completed = useRef(false);
  useEffect(() => { if (pending) { completed.current = false; return; } if (state.ok && !completed.current) { completed.current = true; if (complete) complete(); else router.refresh(); } }, [state, pending, complete, router]);
  const [key] = useState(() => crypto.randomUUID());
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
      <RecordFormControls busy={pending} label={label} />
      {state.ok && <p role="status" className="text-sm text-emerald-700 sm:col-span-2 lg:col-span-4">{mode === "dispatch" ? "Materials released." : "Receipt recorded."}</p>}
      {!state.ok && state.message && <p role="alert" className="text-sm text-red-600 sm:col-span-2 lg:col-span-4">{state.message}</p>}
    </form>;
  if (expanded && dialog) return form;
  if (expanded) return <section className="rounded-xl border border-slate-200 bg-white p-5"><h2 className="text-base font-semibold text-slate-900">{label}</h2>{form}</section>;
  return <details className="group rounded-xl border border-slate-200 bg-white p-4"><summary className="cursor-pointer text-sm font-semibold text-cyan-800 focus-visible:outline-cyan-700">{label}</summary>{form}</details>;
}
