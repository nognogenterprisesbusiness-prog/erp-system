"use client";

import { getFieldPlaceholder } from "@/components/ui/field-placeholder";
import { useActionState, useEffect, useMemo, useRef, useState } from "react";
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
import { Button } from "@/components/ui/button";
import { fieldControlClass } from "@/components/ui/form-field";
import { SelectPicker } from "@/components/ui/select-picker";
import { PesoAmountInput } from "@/components/ui/peso-amount-input";
import { RecordFormControls, useRecordDialog } from "@/components/ui/record-create-dialog";
import type { EmployeeProjectAssignmentRow, LaborRateRow, ProjectRow, ProjectSiteRow } from "@/types/database";

const initialState: WorkforceActionState = { ok: false, message: "" };
const today = new Date().toISOString().slice(0, 10);
type SelectEmployee = { id: string; fullName: string };

function FormMessage({ state }: { state: WorkforceActionState }) {
  if (!state.message) return null;
  return <p role="status" className={`text-xs font-medium ${state.ok ? "text-emerald-700" : "text-red-600"}`}>{state.message}</p>;
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

export function WorkforceAssignmentForm({ employees, projects, sites, fixedEmployeeId, fixedProjectId }: {
  employees: SelectEmployee[];
  projects: Pick<ProjectRow, "id" | "name">[];
  sites: Pick<ProjectSiteRow, "id" | "project_id" | "name">[];
  fixedEmployeeId?: string;
  fixedProjectId?: string;
}) {
  const [state, action, pending] = useActionState(assignEmployeeAction, initialState);
  const inDialog = useCompleteWorkforceDialog(state);
  const [projectId, setProjectId] = useState(fixedProjectId ?? projects[0]?.id ?? "");
  const filteredSites = useMemo(() => sites.filter((site) => site.project_id === projectId), [sites, projectId]);
  return <form action={action} className={inDialog ? "grid gap-4 sm:grid-cols-2" : "grid gap-3 rounded-lg bg-slate-50 p-4 md:grid-cols-2 xl:grid-cols-6"}>
    {fixedEmployeeId ? <input type="hidden" name="employeeId" value={fixedEmployeeId} /> : <label className="grid min-w-0 content-start gap-2 text-sm font-medium">Employee<SelectPicker label="Employee" name="employeeId" required placeholder="Select employee" disabled={pending} options={employees.map((employee) => ({ value: employee.id, label: employee.fullName }))} /></label>}
    {fixedProjectId ? <input type="hidden" name="projectId" value={fixedProjectId} /> : <label className="grid min-w-0 content-start gap-1 text-sm font-medium">Project<SelectPicker label="Project" name="projectId" required value={projectId} onValueChange={setProjectId} disabled={pending} options={projects.map((project) => ({ value: project.id, label: project.name }))} /></label>}
    <label className="grid min-w-0 content-start gap-1 text-sm font-medium">Project site<SelectPicker key={projectId} label="Project site" name="projectSiteId" required placeholder="Select site" disabled={pending} options={filteredSites.map((site) => ({ value: site.id, label: site.name }))} /></label>
    <label className="grid min-w-0 content-start gap-1 text-sm font-medium">Assigned position<input className={fieldControlClass} name="positionTitle" placeholder={getFieldPlaceholder("Assigned position")} required /></label>
    <label className="grid min-w-0 content-start gap-1 text-sm font-medium">Start date<input className={fieldControlClass} name="startDate" type="date" defaultValue={today} required /></label>
    <label className="grid min-w-0 content-start gap-1 text-sm font-medium sm:col-span-2">Remarks (optional)<input className={fieldControlClass} name="remarks" placeholder={getFieldPlaceholder("Remarks (optional)")} /></label>
    <div className={inDialog ? "sm:col-span-2" : "md:col-span-2 xl:col-span-6"}><FormMessage state={state} />{!filteredSites.length && projectId && <p className="text-xs text-amber-700">This project has no active site.</p>}<RecordFormControls busy={pending} disabled={!filteredSites.length} label="Assign employee" /></div>
  </form>;
}

export function EndAssignmentForm({ assignment }: { assignment: EmployeeProjectAssignmentRow }) {
  const [state, action, pending] = useActionState(endEmployeeAssignmentAction, initialState);
  const inDialog = useCompleteWorkforceDialog(state);
  return <form action={action} className={inDialog ? "grid gap-4" : "flex flex-wrap items-center justify-end gap-2"}>
    <input type="hidden" name="assignmentId" value={assignment.id} /><input type="hidden" name="employeeId" value={assignment.employee_id} /><input type="hidden" name="projectId" value={assignment.project_id} />
    <label className={inDialog ? "grid gap-1 text-sm font-medium" : "text-xs"}>{inDialog && "End date"}<input className={inDialog ? fieldControlClass : "h-9 rounded-md border border-slate-200 px-2 text-xs"} name="endDate" aria-label="Assignment end date" type="date" min={assignment.start_date} defaultValue={today < assignment.start_date ? assignment.start_date : today} required /></label>
    <label className={inDialog ? "grid gap-1 text-sm font-medium" : "text-xs"}>{inDialog && "Reason"}<input className={inDialog ? fieldControlClass : "h-9 min-w-40 rounded-md border border-slate-200 px-2 text-xs"} name="remarks" aria-label="Assignment end reason" placeholder={getFieldPlaceholder("Assignment end reason")} required /></label>
    {inDialog ? <><FormMessage state={state} /><RecordFormControls busy={pending} label="End assignment" /></> : <><Button variant="outline" size="sm" disabled={pending}>{pending ? "Ending…" : "End"}</Button><FormMessage state={state} /></>}
  </form>;
}

export function TransferAssignmentForm({ assignment, projects, sites }: {
  assignment: EmployeeProjectAssignmentRow;
  projects: Pick<ProjectRow, "id" | "name">[];
  sites: Pick<ProjectSiteRow, "id" | "project_id" | "name">[];
}) {
  const [state, action, pending] = useActionState(transferEmployeeAssignmentAction, initialState);
  useCompleteWorkforceDialog(state);
  const [projectId, setProjectId] = useState(projects[0]?.id ?? "");
  const filteredSites = useMemo(() => sites.filter((site) => site.project_id === projectId), [sites, projectId]);
  return <form action={action} className="grid gap-4 sm:grid-cols-2">
    <input type="hidden" name="assignmentId" value={assignment.id} /><input type="hidden" name="employeeId" value={assignment.employee_id} />
    <label className="grid min-w-0 content-start gap-1 text-sm font-medium">New project<SelectPicker label="New project" name="projectId" value={projectId} onValueChange={setProjectId} required disabled={pending} options={projects.map((project) => ({ value: project.id, label: project.name }))} /></label>
    <label className="grid min-w-0 content-start gap-1 text-sm font-medium">New site<SelectPicker key={projectId} label="New site" name="projectSiteId" required placeholder="Select new site" disabled={pending} options={filteredSites.map((site) => ({ value: site.id, label: site.name }))} /></label>
    <label className="grid min-w-0 content-start gap-1 text-sm font-medium sm:col-span-2">Position at new site<input className={fieldControlClass} name="positionTitle" defaultValue={assignment.position_title} required placeholder={getFieldPlaceholder("Position at new site")} /></label>
    <label className="grid min-w-0 content-start gap-1 text-sm font-medium">Current assignment end date<input className={fieldControlClass} name="currentEndDate" type="date" min={assignment.start_date} defaultValue={today < assignment.start_date ? assignment.start_date : today} required /></label>
    <label className="grid min-w-0 content-start gap-1 text-sm font-medium">New assignment start date<input className={fieldControlClass} name="newStartDate" type="date" min={today} required /></label>
    <label className="grid min-w-0 content-start gap-1 text-sm font-medium sm:col-span-2">Remarks (optional)<input className={fieldControlClass} name="remarks" placeholder={getFieldPlaceholder("Remarks (optional)")} /></label>
    <div className="sm:col-span-2"><FormMessage state={state} />{!filteredSites.length && projectId && <p className="text-xs text-amber-700">This project has no active site.</p>}<RecordFormControls busy={pending} disabled={!filteredSites.length} label="Transfer employee" /></div>
  </form>;
}

export function LaborRateForm({ employeeId }: { employeeId: string }) {
  const [state, action, pending] = useActionState(addLaborRateAction, initialState);
  useCompleteWorkforceDialog(state);
  return <form action={action} className="grid gap-4 sm:grid-cols-2">
    <input type="hidden" name="employeeId" value={employeeId} />
    <label className="grid min-w-0 content-start gap-1 text-sm font-medium">Rate type<SelectPicker label="Rate type" name="rateType" defaultValue="daily" disabled={pending} options={[{ value: "daily", label: "Daily" }, { value: "hourly", label: "Hourly" }]} /></label>
    <PesoAmountInput name="amount" label="Rate amount (PHP)" required submitUngrouped />
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
  const [state, action, pending] = useActionState(closeLaborRateAction, initialState);
  useCompleteWorkforceDialog(state);
  return <form action={action} className="grid gap-4"><input type="hidden" name="employeeId" value={employeeId} /><input type="hidden" name="rateId" value={rate.id} /><label className="grid min-w-0 content-start gap-1 text-sm font-medium">Rate end date<input className={fieldControlClass} name="effectiveEndDate" type="date" min={rate.effective_start_date} defaultValue={today < rate.effective_start_date ? rate.effective_start_date : today} required /></label><FormMessage state={state} /><RecordFormControls busy={pending} label="Close rate" /></form>;
}

export function ArchiveEmployeeForm({ employeeId }: { employeeId: string }) {
  const [state, action, pending] = useActionState(archiveEmployeeAction, initialState);
  return <form action={action} className="flex flex-wrap items-center justify-end gap-2"><input type="hidden" name="id" value={employeeId} /><input className="h-10 min-w-52 rounded-lg border border-slate-200 px-3 text-sm" name="reason" placeholder="Separation / archive reason" required minLength={3} /><Button variant="outline" type="submit" disabled={pending}>{pending ? "Archiving…" : "Archive employee"}</Button><FormMessage state={state} /></form>;
}
