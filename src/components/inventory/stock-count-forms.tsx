"use client";

import { useActionState, useState } from "react";
import { decideStockCountAction, recordStockCountAction, type StockCountActionState } from "@/app/(workspace)/inventory/counts/actions";
import { Button } from "@/components/ui/button";
import { FormField, fieldControlClass } from "@/components/ui/form-field";
import { SelectPicker } from "@/components/ui/select-picker";

const initialState: StockCountActionState = { message: "" };

export function RecordStockCountForm({ materialId, locationId, unitSymbol, onHand }: { materialId: string; locationId: string; unitSymbol: string; onHand: number }) {
  const [state, action, pending] = useActionState(recordStockCountAction, initialState);
  const [key] = useState(() => crypto.randomUUID());
  return <form action={action} className="mt-3 grid gap-3 rounded-lg border border-slate-200 bg-slate-50 p-3 sm:grid-cols-[140px_150px_1fr_auto] sm:items-end">
    <input type="hidden" name="idempotencyKey" value={key} /><input type="hidden" name="materialId" value={materialId} /><input type="hidden" name="locationId" value={locationId} />
    <FormField label={`Counted (${unitSymbol})`} htmlFor={`count-${materialId}`} error={state.fieldErrors?.countedQuantity?.[0]}><input id={`count-${materialId}`} name="countedQuantity" inputMode="decimal" defaultValue={onHand} className={fieldControlClass} required /></FormField>
    <FormField label="Reason type" htmlFor={`reason-type-${materialId}`} error={state.fieldErrors?.reasonType?.[0]}><SelectPicker label="Reason type" name="reasonType" defaultValue="physical_count" options={[{ value: "physical_count", label: "Physical count" }, { value: "damaged", label: "Damaged" }, { value: "missing", label: "Missing" }]} /></FormField>
    <FormField label="Count reason / reference" htmlFor={`reason-${materialId}`} error={state.fieldErrors?.reason?.[0]}><input id={`reason-${materialId}`} name="reason" maxLength={500} placeholder="Monthly physical count" className={fieldControlClass} required /></FormField>
    <Button type="submit" size="sm" disabled={pending || state.ok}>{pending ? "Saving…" : "Submit count"}</Button>
    {state.message && <p role={state.ok ? "status" : "alert"} className={`text-sm sm:col-span-4 ${state.ok ? "text-emerald-700" : "text-red-700"}`}>{state.message}</p>}
  </form>;
}

export function StockCountDecisionForm({ countId, surplus }: { countId: string; surplus: boolean }) {
  const [state, action, pending] = useActionState(decideStockCountAction, initialState);
  return <form action={action} className="mt-3 flex flex-wrap items-end gap-2">
    <input type="hidden" name="countId" value={countId} />
    <div className="min-w-[180px] flex-1"><FormField label="Decision note" htmlFor={`decision-${countId}`} error={state.fieldErrors?.note?.[0]}><input id={`decision-${countId}`} name="note" maxLength={500} className={fieldControlClass} placeholder={surplus ? "Explain surplus investigation" : "Optional approval note"} /></FormField></div>
    {!surplus && <Button type="submit" name="decision" value="approve" size="sm" disabled={pending || state.ok}>Approve</Button>}
    <Button type="submit" name="decision" value="reject" variant="outline" size="sm" disabled={pending || state.ok}>Reject</Button>
    {state.message && <p role={state.ok ? "status" : "alert"} className={`w-full text-sm ${state.ok ? "text-emerald-700" : "text-red-700"}`}>{state.message}</p>}
  </form>;
}
