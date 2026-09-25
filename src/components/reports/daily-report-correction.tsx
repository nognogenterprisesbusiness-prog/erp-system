"use client";

import { useActionState } from "react";
import { startDailyReportCorrectionAction, type DailyReportActionState } from "@/app/(workspace)/reports/daily/actions";
import { Button } from "@/components/ui/button";

const initialState: DailyReportActionState = { ok: false, message: "" };

export function DailyReportCorrection({ reportId }: { reportId: string }) {
  const [state, action, pending] = useActionState(startDailyReportCorrectionAction, initialState);
  return <form action={action}>
    <input type="hidden" name="reportId" value={reportId} />
    <Button type="submit" disabled={pending}>{pending ? "Opening…" : "Start correction"}</Button>
    {!state.ok && state.message && <p role="alert" className="mt-2 text-xs text-red-700">{state.message}</p>}
  </form>;
}
