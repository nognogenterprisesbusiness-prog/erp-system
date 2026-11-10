"use client";

import { useActionState, useState } from "react";
import { decideMaterialRequestAction, type RequestActionState } from "@/app/(workspace)/requests/actions";
import { Button } from "@/components/ui/button";
import { FormField, fieldControlClass } from "@/components/ui/form-field";

type DecisionLine = { id: string; name: string; code: string; requested_quantity: number; unitSymbol: string; sourceAvailable: number | null };
const initialState: RequestActionState = { ok: false, message: "" };

export function MaterialRequestDecision({ requestId, lines }: { requestId: string; lines: DecisionLine[] }) {
  const [state, action, pending] = useActionState(decideMaterialRequestAction, initialState);
  const [idempotencyKey] = useState(() => crypto.randomUUID());
  const [quantities, setQuantities] = useState<Record<string, string>>(() => Object.fromEntries(lines.map((line) => [line.id, String(line.requested_quantity)])));
  const exceedsStock = lines.some((line) => line.sourceAvailable !== null && Number(quantities[line.id]) > line.sourceAvailable);
  const isReduced = lines.some((line) => Number(quantities[line.id]) < line.requested_quantity);
  return <form action={action} className="rounded-xl border border-slate-200 bg-white p-5 sm:p-6">
    <input type="hidden" name="idempotencyKey" value={idempotencyKey} />
    <input type="hidden" name="requestId" value={requestId} />
    <input type="hidden" name="decisions" value={JSON.stringify(quantities)} />
    <h2 className="text-base font-semibold text-slate-900">Manager decision</h2>
    <p className="mt-1 text-sm text-slate-500">Approve each quantity, or enter zero to reject a line. Approved stock is set aside for this request until it is released.</p>
    <div className="mt-5 grid gap-3">{lines.map((line) => <FormField key={line.id} label={`${line.code} · ${line.name} (requested ${line.requested_quantity} ${line.unitSymbol})`} htmlFor={`approved-${line.id}`} hint={line.sourceAvailable === null ? "Source availability is restricted. The server checks stock when saving." : `Available at selected warehouse: ${line.sourceAvailable} ${line.unitSymbol}`}>
      <input id={`approved-${line.id}`} className={fieldControlClass} inputMode="decimal" value={quantities[line.id] ?? ""} onChange={(event) => setQuantities((current) => ({ ...current, [line.id]: event.target.value }))} required />
    </FormField>)}</div>
    <FormField label={isReduced ? "Reason for reduction or rejection" : "Decision note (optional)"} htmlFor="decisionReason" className="mt-5">
      <textarea id="decisionReason" name="reason" className={`${fieldControlClass} h-auto py-3`} rows={2} maxLength={500} required={isReduced} />
    </FormField>
    {!state.ok && state.message && <p role="alert" className="mt-4 text-sm font-medium text-red-600">{state.message}</p>}
    {exceedsStock && <p role="alert" className="mt-4 text-sm text-amber-800">An approval quantity exceeds available stock at this warehouse. Reduce it or ask Admin to choose another source.</p>}
    <div className="mt-5 flex justify-end"><Button type="submit" disabled={pending || exceedsStock || lines.some((line) => !quantities[line.id])}>{pending ? "Saving…" : "Save decision"}</Button></div>
  </form>;
}
