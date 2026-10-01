"use client";

import { useActionState } from "react";
import { recordProjectProgressAction, type DailyReportActionState } from "@/app/(workspace)/reports/daily/actions";
import { Button } from "@/components/ui/button";
import { FormField, fieldControlClass } from "@/components/ui/form-field";
import { PercentageInput } from "@/components/ui/percentage-input";

const initialState: DailyReportActionState = { ok: false, message: "" };

export function ProjectProgressForm({ reportId }: { reportId: string }) {
  const [state, action, pending] = useActionState(recordProjectProgressAction, initialState);
  return <form action={action} className="mt-5 rounded-xl border border-slate-200 bg-white p-5 sm:p-6">
    <input type="hidden" name="reportId" value={reportId} />
    <h2 className="text-base font-semibold">Record project progress</h2>
    <p className="mt-1 text-sm text-slate-500">Enter the estimated overall project completion as of this report.</p>
    <div className="mt-4 grid gap-4 sm:grid-cols-[180px_1fr]">
      <FormField label="Complete (%)" htmlFor="progress-percent" error={state.ok ? undefined : state.fieldErrors?.percent?.[0]}><PercentageInput id="progress-percent" name="percent" className={fieldControlClass} decimals={2} placeholder="45" required /></FormField>
      <FormField label="Progress summary" htmlFor="progress-summary" error={state.ok ? undefined : state.fieldErrors?.summary?.[0]}><input id="progress-summary" name="summary" className={fieldControlClass} maxLength={500} placeholder="Foundation work completed" required /></FormField>
    </div>
    {state.message && <p role={state.ok ? "status" : "alert"} className={`mt-3 text-sm ${state.ok ? "text-emerald-700" : "text-red-700"}`}>{state.message}</p>}
    <div className="mt-4 flex justify-end"><Button type="submit" disabled={pending || state.ok}>{pending ? "Saving…" : "Record progress"}</Button></div>
  </form>;
}
