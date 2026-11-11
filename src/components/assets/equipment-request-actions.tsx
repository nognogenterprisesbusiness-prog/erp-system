"use client";

import { getFieldPlaceholder } from "@/components/ui/field-placeholder";
import { useActionState, useEffect, useRef, useState } from "react";
import { checkoutEquipmentRequestAction, decideEquipmentRequestAction, returnEquipmentRequestAction, type EquipmentRequestActionState } from "@/app/(workspace)/equipment/requests/actions";
import { Button } from "@/components/ui/button";
import { DialogHeading } from "@/components/ui/dialog-heading";
import type { EquipmentRequestStatus } from "@/types/database";

const initialState: EquipmentRequestActionState = { ok: false, message: "" };
type Mode = "approve" | "reject" | "withdraw" | "checkout" | "return";

export function EquipmentRequestActions({ id, status }: { id: string; status: EquipmentRequestStatus }) {
  const [decision, decide, decisionPending] = useActionState(decideEquipmentRequestAction, initialState);
  const [checkout, handover, checkoutPending] = useActionState(checkoutEquipmentRequestAction, initialState);
  const [returned, returnAction, returnPending] = useActionState(returnEquipmentRequestAction, initialState);
  const [mode, setMode] = useState<Mode | null>(null);
  const dialog = useRef<HTMLDialogElement>(null);

  useEffect(() => { if (mode && !dialog.current?.open) dialog.current?.showModal(); }, [mode]);
  function close() { if (!decisionPending && !checkoutPending && !returnPending) { dialog.current?.close(); setMode(null); } }

  if (status === "returned" || status === "rejected") return null;
  const pending = decisionPending || checkoutPending || returnPending;
  const title = mode === "approve" ? "Approve equipment request" : mode === "reject" ? "Reject equipment request" : mode === "withdraw" ? "Withdraw approval" : mode === "checkout" ? "Check out equipment" : "Record equipment return";
  const activeResult = mode === "return" ? returned : mode === "checkout" ? checkout : decision;

  return <>
    <div className="flex flex-wrap items-center justify-end gap-2">
      {status === "submitted" && <><Button size="sm" onClick={() => setMode("approve")} disabled={pending}>Approve</Button><Button size="sm" variant="outline" className="text-red-700" onClick={() => setMode("reject")} disabled={pending}>Reject</Button></>}
      {status === "approved" && <><Button size="sm" onClick={() => setMode("checkout")} disabled={pending}>Hand over to site</Button><Button size="sm" variant="outline" className="text-red-700" onClick={() => setMode("withdraw")} disabled={pending}>Withdraw approval</Button></>}
      {status === "checked_out" && <Button size="sm" variant="outline" onClick={() => setMode("return")} disabled={pending}>Record return</Button>}
    </div>
    {checkout.message && <p role={checkout.ok ? "status" : "alert"} className={`mt-1 text-xs ${checkout.ok ? "text-emerald-700" : "text-red-600"}`}>{checkout.message}</p>}
    <dialog ref={dialog} onCancel={event => { if (pending) event.preventDefault(); }} onClose={() => setMode(null)} aria-label={title} className="m-auto w-[min(100%-2rem,440px)] rounded-2xl border border-slate-200 bg-white p-6 text-[#07152d] shadow-2xl backdrop:bg-slate-950/45">
      <DialogHeading title={title} onClose={close} disabled={pending} />
      {mode && <form action={mode === "return" ? returnAction : mode === "checkout" ? handover : decide} className="mt-5 grid gap-4">
        <input type="hidden" name="id" value={id} />
        {mode !== "return" && mode !== "checkout" && <input type="hidden" name="decision" value={mode === "approve" ? "approve" : "reject"} />}
        {mode === "checkout" ? <p className="text-sm text-slate-600">Confirm the equipment has been handed over to the approved project site.</p> : <label className="grid gap-1.5 text-sm font-medium">{mode === "return" ? "Return condition" : mode === "approve" ? "Approval note (optional)" : "Reason"}
          <textarea name="note" required={mode !== "approve"} minLength={mode === "approve" ? undefined : 3} maxLength={500} className="min-h-24 rounded-lg border border-slate-200 bg-white p-3 text-sm outline-none focus-visible:ring-2 focus-visible:ring-cyan-600" placeholder={getFieldPlaceholder(mode === "return" ? "Return condition" : mode === "approve" ? "Approval note" : "Reason")} />

        </label>}
        {mode === "return" && <label className="flex items-center gap-2 text-sm"><input type="checkbox" name="needsMaintenance" />Needs maintenance</label>}
        {activeResult.message && <p role={activeResult.ok ? "status" : "alert"} className={`text-sm ${activeResult.ok ? "text-emerald-700" : "text-red-600"}`}>{activeResult.message}</p>}
        <div className="flex justify-end gap-2"><Button type="button" variant="outline" onClick={close} disabled={pending}>Cancel</Button><Button type="submit" disabled={pending}>{pending ? "Saving…" : mode === "return" ? "Record return" : mode === "checkout" ? "Confirm checkout" : mode === "approve" ? "Approve" : mode === "reject" ? "Reject" : "Withdraw approval"}</Button></div>
      </form>}
    </dialog>
  </>;
}
