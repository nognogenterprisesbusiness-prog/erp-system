"use client";

import { useActionState, useState } from "react";
import { postAttendanceAction, reverseAttendanceAction, type AttendanceActionState } from "@/app/(workspace)/projects/[id]/attendance/actions";
import { Button } from "@/components/ui/button";
import { DatePicker } from "@/components/ui/date-picker";
import { FormField, fieldControlClass } from "@/components/ui/form-field";
import { SelectPicker } from "@/components/ui/select-picker";

const initialState: AttendanceActionState = { message: "" };
type AssignmentChoice = { id: string; employee_id: string; start_date: string; end_date: string | null; employee?: { code: string; first_name: string; last_name: string } };

export function PostAttendanceForm({ projectId, assignments, idempotencyKey, today, embedded = false }: { projectId: string; assignments: AssignmentChoice[]; idempotencyKey: string; today: string; embedded?: boolean }) {
  const [state, action, pending] = useActionState(postAttendanceAction, initialState);
  const [assignmentId, setAssignmentId] = useState(assignments[0]?.id ?? "");
  const [status, setStatus] = useState<"present" | "absent">("present");
  const [rateType, setRateType] = useState<"hourly" | "daily">("hourly");
  const error = (field: string) => state.fieldErrors?.[field]?.[0];
  return <form action={action} className={embedded ? "" : "rounded-xl border border-slate-200 bg-white p-5 sm:p-6"}>
    <input type="hidden" name="idempotencyKey" value={idempotencyKey} /><input type="hidden" name="projectId" value={projectId} />
    <input type="hidden" name="assignmentId" value={assignmentId} /><input type="hidden" name="status" value={status} /><input type="hidden" name="rateType" value={status === "absent" ? "none" : rateType} />
    {!embedded && <h2 className="text-base font-semibold text-slate-900">Post attendance</h2>}
    <div className={`${embedded ? "" : "mt-5 "}grid gap-5 md:grid-cols-2`}>
      <FormField label="Employee assignment" htmlFor="attendanceAssignment" error={error("assignmentId")}><SelectPicker label="Employee assignment" value={assignmentId} onValueChange={setAssignmentId} options={assignments.map((item) => ({ value: item.id, label: `${item.employee?.code ?? "Employee"} · ${item.employee?.first_name ?? ""} ${item.employee?.last_name ?? ""} · ${item.start_date}${item.end_date ? `–${item.end_date}` : "–current"}` }))} /></FormField>
      <FormField label="Work date" htmlFor="attendanceDate" error={error("workDate")}><DatePicker id="attendanceDate" name="workDate" label="Work date" defaultValue={today} allowClear={false} required /></FormField>
      <FormField label="Status" htmlFor="attendanceStatus" error={error("status")}><SelectPicker label="Attendance status" value={status} onValueChange={(next) => setStatus(next as "present" | "absent")} options={[{ value: "present", label: "Present" }, { value: "absent", label: "Absent" }]} /></FormField>
      {status === "present" && <FormField label="Approved rate type" htmlFor="attendanceRateType" error={error("rateType")}><SelectPicker label="Approved rate type" value={rateType} onValueChange={(next) => setRateType(next as "hourly" | "daily")} options={[{ value: "hourly", label: "Hourly" }, { value: "daily", label: "Daily" }]} /></FormField>}
      <FormField label="Hours worked" htmlFor="attendanceHours" error={error("hours")} hint={status === "absent" ? "Absent days have zero hours and cost." : "Total hours for one employee across projects cannot exceed 24 per day."}><input id="attendanceHours" name="hours" className={fieldControlClass} inputMode="decimal" defaultValue={status === "absent" ? "0" : ""} key={status} readOnly={status === "absent"} placeholder="8.00" required /></FormField>
      {status === "present" && rateType === "daily" ? <FormField label="Paid-day fraction" htmlFor="dayFraction" error={error("dayFraction")} hint="Enter an explicit fraction, e.g. 0.5 for half a paid day. No hours-to-day conversion is assumed."><input id="dayFraction" name="dayFraction" className={fieldControlClass} inputMode="decimal" placeholder="1" required /></FormField> : <input type="hidden" name="dayFraction" value="" />}
      <FormField label="Work note" htmlFor="attendanceNote" error={error("note")} className="md:col-span-2"><input id="attendanceNote" name="note" className={fieldControlClass} maxLength={500} placeholder={status === "present" ? "Work completed at the site" : "Reason for absence"} required /></FormField>
    </div>
    {state.message && <p role="alert" className="mt-4 text-sm text-red-700">{state.message}</p>}
    <div className="mt-6 flex justify-end"><Button type="submit" disabled={pending || !assignmentId}>{pending ? "Posting…" : "Post attendance"}</Button></div>
  </form>;
}

export function ReverseAttendanceForm({ projectId, attendanceId, idempotencyKey }: { projectId: string; attendanceId: string; idempotencyKey: string }) {
  const [state, action, pending] = useActionState(reverseAttendanceAction, initialState);
  return <form action={action} className="space-y-3"><input type="hidden" name="projectId" value={projectId} /><input type="hidden" name="attendanceId" value={attendanceId} /><input type="hidden" name="idempotencyKey" value={idempotencyKey} /><FormField label="Correction reason" htmlFor={`attendance-reason-${attendanceId}`} error={state.fieldErrors?.reason?.[0]}><input id={`attendance-reason-${attendanceId}`} name="reason" className={fieldControlClass} minLength={3} maxLength={500} required /></FormField>{state.message && <p role="alert" className="text-xs text-red-700">{state.message}</p>}<Button type="submit" variant="outline" size="sm" disabled={pending}>{pending ? "Reversing…" : "Reverse entry"}</Button></form>;
}
