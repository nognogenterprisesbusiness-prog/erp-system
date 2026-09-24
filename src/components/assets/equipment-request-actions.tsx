"use client";

import { useActionState } from "react";
import { checkoutEquipmentRequestAction, decideEquipmentRequestAction, returnEquipmentRequestAction, type EquipmentRequestActionState } from "@/app/(workspace)/equipment/requests/actions";
import { Button } from "@/components/ui/button";
import type { EquipmentRequestStatus } from "@/types/database";

const initialState: EquipmentRequestActionState = { ok: false, message: "" };

export function EquipmentRequestActions({ id, status }: { id: string; status: EquipmentRequestStatus }) {
  const [decision, decide, decisionPending] = useActionState(decideEquipmentRequestAction, initialState);
  const [checkout, handover, checkoutPending] = useActionState(checkoutEquipmentRequestAction, initialState);
  const [returned, returnAction, returnPending] = useActionState(returnEquipmentRequestAction, initialState);
  if (status === "returned" || status === "rejected") return null;
  return <details className="relative text-left">
    <summary className="cursor-pointer text-xs font-semibold text-cyan-700 hover:underline">Actions</summary>
    <div className="mt-2 min-w-[210px] space-y-3 rounded-lg border border-slate-200 bg-white p-3 shadow-sm">
      {status === "submitted" && <>
        <form action={decide} className="space-y-2"><input type="hidden" name="id" value={id} /><input type="hidden" name="decision" value="approve" /><input name="note" aria-label="Approval note" maxLength={500} placeholder="Approval note (optional)" className="h-9 w-full rounded-lg border border-slate-200 px-3 text-xs" /><Button size="sm" disabled={decisionPending}>Approve</Button></form>
        <form action={decide} className="space-y-2"><input type="hidden" name="id" value={id} /><input type="hidden" name="decision" value="reject" /><input name="note" aria-label="Rejection reason" required minLength={3} maxLength={500} placeholder="Reason for rejection" className="h-9 w-full rounded-lg border border-slate-200 px-3 text-xs" /><Button size="sm" variant="outline" disabled={decisionPending}>Reject</Button></form>
      </>}
      {status === "approved" && <form action={handover}><input type="hidden" name="id" value={id} /><Button size="sm" disabled={checkoutPending}>Check out to site</Button></form>}
      {status === "checked_out" && <form action={returnAction} className="space-y-2"><input type="hidden" name="id" value={id} /><input name="note" aria-label="Return condition" required minLength={3} maxLength={500} placeholder="Return condition" className="h-9 w-full rounded-lg border border-slate-200 px-3 text-xs" /><label className="flex items-center gap-2 text-xs"><input type="checkbox" name="needsMaintenance" />Needs maintenance</label><Button size="sm" disabled={returnPending}>Record return</Button></form>}
      {[decision, checkout, returned].filter((result) => result.message).map((result, index) => <p key={index} role={result.ok ? "status" : "alert"} className={`text-xs ${result.ok ? "text-emerald-700" : "text-red-600"}`}>{result.message}</p>)}
    </div>
  </details>;
}
