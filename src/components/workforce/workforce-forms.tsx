"use client";

import { philippinesDate } from "@nognog/domain";
import { getFieldPlaceholder } from "@/components/ui/field-placeholder";
import { useActionState, useEffect, useRef, useState } from "react";
import {
  addLaborRateAction,
  setAttendanceBasisAction,
  archiveEmployeeAction,
  assignEmployeeAction,
  closeLaborRateAction,
  endEmployeeAssignmentAction,
  transferEmployeeAssignmentAction,
  type WorkforceActionState,
} from "@/app/(workspace)/employees/actions";
import { fieldControlClass } from "@/components/ui/form-field";
import { RemoteSelectPicker } from "@/components/ui/remote-select-picker";
import { SelectPicker } from "@/components/ui/select-picker";
import { PesoAmountInput } from "@/components/ui/peso-amount-input";
import { RecordFormControls, useRecordDialog } from "@/components/ui/record-create-dialog";
import type { EmployeeProjectAssignmentRow, LaborRateRow } from "@/types/database";

const initialState: WorkforceActionState = { ok: false, message: "" };

function FormMessage({ state }: { state: WorkforceActionState }) {
  if (!state.message) return null;
  return <p role={state.ok ? "status" : "alert"} className={`text-xs font-medium ${state.ok ? "text-emerald-700" : "text-red-600"}`}>{state.message}</p>;
}

function useCompleteWorkforceDialog(state: WorkforceActionState) {
  const dialog = useRecordDialog();
  const completed = useRef(false);
  useEffect(() => {
    if (state.ok && dialog && !completed.current) {
      completed.current = true;
      dialog.complete();
    }
  }, [state.ok, dialog]);
  return !!dialog;
}

export function WorkforceAssignmentForm({ fixedEmployeeId, fixedProjectId }: {
  fixedEmployeeId?: string;
  fixedProjectId?: string;
}) {
  const today = philippinesDate();
  const [state, action, pending] = useActionState(assignEmployeeAction, initialState);
  const inDialog = useCompleteWorkforceDialog(state);
  const [projectId, setProjectId] = useState(fixedProjectId ?? "");
  const [siteId, setSiteId] = useState("");
  return <form action={action} className={inDialog ? "grid gap-4 sm:grid-cols-2" : "grid gap-3 rounded-lg bg-slate-50 p-4 md:grid-cols-2 xl:grid-cols-6"}>
    {fixedEmployeeId ? <input type="hidden" name="employeeId" value={fixedEmployeeId} /> : <label className="grid min-w-0 content-start gap-2 text-sm font-medium">Employee<RemoteSelectPicker kind="employee" label="Employee" name="employeeId" required placeholder="Choose employee" disabled={pending} /></label>}
    {fixedProjectId ? <input type="hidden" name="projectId" value={fixedProjectId} /> : <label className="grid min-w-0 content-start gap-1 text-sm font-medium">Project<RemoteSelectPicker kind="project" label="Project" name="projectId" required value={projectId} onValueChange={id => { setProjectId(id); setSiteId(""); }} disabled={pending} /></label>}
    <label className="grid min-w-0 content-start gap-1 text-sm font-medium">Project site<RemoteSelectPicker kind="site" projectId={projectId} label="Project site" name="projectSiteId" required value={siteId} onValueChange={setSiteId} placeholder="Choose site" disabled={pending || !projectId} /></label>
    <label className="grid min-w-0 content-start gap-1 text-sm font-medium">Assigned position<input className={fieldControlClass} name="positionTitle" placeholder={getFieldPlaceholder("Assigned position")} required /></label>
    <label className="grid min-w-0 content-start gap-1 text-sm font-medium">Start date<input className={fieldControlClass} name="startDate" type="date" defaultValue={today} required /></label>
    <label className="grid min-w-0 content-start gap-1 text-sm font-medium sm:col-span-2">Remarks (optional)<input className={fieldControlClass} name="remarks" placeholder={getFieldPlaceholder("Remarks (optional)")} /></label>
    <div className={inDialog ? "sm:col-span-2" : "md:col-span-2 xl:col-span-6"}><FormMessage state={state} /><RecordFormControls busy={pending} disabled={!siteId} label="Assign employee" /></div>
  </form>;
}

export function EndAssignmentForm({ assignment }: { assignment: EmployeeProjectAssignmentRow }) {
  const today = philippinesDate();
  const [state, action, pending] = useActionState(endEmployeeAssignmentAction, initialState);
  useCompleteWorkforceDialog(state);
  return <form action={action} className="grid gap-4">
    <input type="hidden" name="assignmentId" value={assignment.id} /><input type="hidden" name="employeeId" value={assignment.employee_id} /><input type="hidden" name="projectId" value={assignment.project_id} />
    <label className="grid gap-2 text-sm font-medium">End date<input className={fieldControlClass} name="endDate" type="date" min={assignment.start_date} defaultValue={today < assignment.start_date ? assignment.start_date : today} required disabled={pending} /></label>
    <label className="grid gap-2 text-sm font-medium">Reason<input className={fieldControlClass} name="remarks" placeholder={getFieldPlaceholder("Assignment end reason")} required disabled={pending} /></label>
    <FormMessage state={state} />
    <RecordFormControls busy={pending} label="End assignment" />
  </form>;
}

export function TransferAssignmentForm({ assignment }: {
  assignment: EmployeeProjectAssignmentRow;
}) {
  const today = philippinesDate();
  const [state, action, pending] = useActionState(transferEmployeeAssignmentAction, initialState);
  useCompleteWorkforceDialog(state);
  const [projectId, setProjectId] = useState("");
  const [siteId, setSiteId] = useState("");
  return <form action={action} className="grid gap-4 sm:grid-cols-2">
    <input type="hidden" name="assignmentId" value={assignment.id} /><input type="hidden" name="employeeId" value={assignment.employee_id} />
    <label className="grid min-w-0 content-start gap-1 text-sm font-medium">New project<RemoteSelectPicker kind="project" label="New project" name="projectId" required value={projectId} onValueChange={id => { setProjectId(id); setSiteId(""); }} disabled={pending} /></label>
    <label className="grid min-w-0 content-start gap-1 text-sm font-medium">New site<RemoteSelectPicker kind="site" projectId={projectId} label="New site" name="projectSiteId" required value={siteId} onValueChange={setSiteId} placeholder="Choose site" disabled={pending || !projectId} /></label>
    <label className="grid min-w-0 content-start gap-1 text-sm font-medium sm:col-span-2">Position at new site<input className={fieldControlClass} name="positionTitle" defaultValue={assignment.position_title} required placeholder={getFieldPlaceholder("Position at new site")} /></label>
    <label className="grid min-w-0 content-start gap-1 text-sm font-medium">Current assignment end date<input className={fieldControlClass} name="currentEndDate" type="date" min={assignment.start_date} defaultValue={today < assignment.start_date ? assignment.start_date : today} required /></label>
    <label className="grid min-w-0 content-start gap-1 text-sm font-medium">New assignment start date<input className={fieldControlClass} name="newStartDate" type="date" min={today} required /></label>
    <label className="grid min-w-0 content-start gap-1 text-sm font-medium sm:col-span-2">Remarks (optional)<input className={fieldControlClass} name="remarks" placeholder={getFieldPlaceholder("Remarks (optional)")} /></label>
    <div className="sm:col-span-2"><FormMessage state={state} /><RecordFormControls busy={pending} disabled={!siteId} label="Transfer employee" /></div>
  </form>;
}

export function LaborRateForm({ employeeId }: { employeeId: string }) {
  const today = philippinesDate();
  const [state, action, pending] = useActionState(addLaborRateAction, initialState);
  useCompleteWorkforceDialog(state);
  return <form action={action} className="grid gap-4 sm:grid-cols-2">
    <input type="hidden" name="employeeId" value={employeeId} />
    <label className="grid min-w-0 content-start gap-1 text-sm font-medium">Rate type<SelectPicker label="Rate type" name="rateType" defaultValue="daily" disabled={pending} options={[{ value: "daily", label: "Daily" }, { value: "hourly", label: "Hourly" }]} /></label>
    <PesoAmountInput name="amount" label="Rate amount (PHP)" required />
    <label className="grid min-w-0 content-start gap-1 text-sm font-medium">Effective from<input className={fieldControlClass} name="effectiveStartDate" type="date" defaultValue={today} required /></label>
    <label className="grid min-w-0 content-start gap-1 text-sm font-medium">Effective until (optional)<input className={fieldControlClass} name="effectiveEndDate" type="date" /></label>
    <div className="sm:col-span-2"><FormMessage state={state} /><RecordFormControls busy={pending} label="Add rate" /></div>
  </form>;
}

export function AttendanceBasisForm({ employeeId }: { employeeId: string }) {
  const [state, action, pending] = useActionState(setAttendanceBasisAction, initialState);
  useCompleteWorkforceDialog(state);
  return <form action={action} className="grid gap-4"><input type="hidden" name="employeeId" value={employeeId} /><p className="text-sm text-slate-600">Choose how this employee&apos;s future attendance is costed. Historical costs stay unchanged.</p><label className="grid min-w-0 content-start gap-1 text-sm font-medium">Attendance costing basis<SelectPicker label="Attendance costing basis" name="rateType" required placeholder="Choose basis" disabled={pending} options={[{ value: "daily", label: "Daily" }, { value: "hourly", label: "Hourly" }]} /></label><FormMessage state={state} /><RecordFormControls busy={pending} label="Save basis" /></form>;
}

export function CloseLaborRateForm({ employeeId, rate }: { employeeId: string; rate: LaborRateRow }) {
  const today = philippinesDate();
  const [state, action, pending] = useActionState(closeLaborRateAction, initialState);
  useCompleteWorkforceDialog(state);
  return <form action={action} className="grid gap-4"><input type="hidden" name="employeeId" value={employeeId} /><input type="hidden" name="rateId" value={rate.id} /><label className="grid min-w-0 content-start gap-1 text-sm font-medium">Rate end date<input className={fieldControlClass} name="effectiveEndDate" type="date" min={rate.effective_start_date} defaultValue={today < rate.effective_start_date ? rate.effective_start_date : today} required /></label><FormMessage state={state} /><RecordFormControls busy={pending} label="Close rate" /></form>;
}

export function ArchiveEmployeeForm({ employeeId }: { employeeId: string }) {
  const [state, action, pending] = useActionState(archiveEmployeeAction, initialState);
  return <form action={action} className="grid gap-4">
    <input type="hidden" name="id" value={employeeId} />
    <p className="text-sm leading-6 text-slate-600">Remove this employee from the active list. Their record and history are kept. End any active project assignments before archiving.</p>
    <label className="grid gap-2 text-sm font-medium">Separation / archive reason<textarea className={`${fieldControlClass} h-auto py-3`} name="reason" rows={3} placeholder="Explain why this employee is being archived" required minLength={3} maxLength={500} disabled={pending} /></label>
    <FormMessage state={state} />
    <RecordFormControls busy={pending} label="Confirm archive" />
  </form>;
}
