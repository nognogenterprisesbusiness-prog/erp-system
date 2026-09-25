"use client";

import { useActionState } from "react";
import { reviewDailyReportAction, type DailyReportActionState } from "@/app/(workspace)/reports/daily/actions";
import { Button } from "@/components/ui/button";
import { FormField, fieldControlClass } from "@/components/ui/form-field";

const initialState: DailyReportActionState = { ok: false, message: "" };

export function DailyReportReview({ reportId }: { reportId: string }) {
  const [state, action, pending] = useActionState(reviewDailyReportAction, initialState);
  return <form action={action} className="mt-5 rounded-xl border border-slate-200 bg-white p-5 sm:p-6">
    <input type="hidden" name="reportId" value={reportId} />
    <h2 className="text-base font-semibold text-slate-900">Review submitted report</h2>
    <p className="mt-1 text-xs text-slate-500">Approval locks this revision. To return it, explain what the preparer must correct.</p>
    <div className="mt-4 max-w-2xl"><FormField label="Review note" htmlFor="reviewNote" error={state.ok ? undefined : state.fieldErrors?.note?.[0]}>
      <textarea id="reviewNote" name="note" maxLength={500} rows={3} className={`${fieldControlClass} h-auto min-h-24 py-3`} />
    </FormField></div>
    {state.message && <p role={state.ok ? "status" : "alert"} className={`mt-3 text-sm ${state.ok ? "text-emerald-700" : "text-red-700"}`}>{state.message}</p>}
    <div className="mt-4 flex flex-wrap gap-3">
      <Button type="submit" name="action" value="approve" disabled={pending || state.ok}>{pending ? "Saving…" : "Approve report"}</Button>
      <Button type="submit" name="action" value="return" variant="outline" disabled={pending || state.ok}>Return for correction</Button>
    </div>
  </form>;
}
