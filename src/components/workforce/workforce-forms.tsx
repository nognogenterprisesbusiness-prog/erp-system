"use client";

import { useActionState, useMemo, useState } from "react";
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
import { PesoAmountInput } from "@/components/ui/peso-amount-input";
import type { EmployeeProjectAssignmentRow, LaborRateRow, ProjectRow, ProjectSiteRow } from "@/types/database";

const initialState: WorkforceActionState = { ok: false, message: "" };
const today = new Date().toISOString().slice(0, 10);
type SelectEmployee = { id: string; fullName: string };

function FormMessage({ state }: { state: WorkforceActionState }) {
  if (!state.message) return null;
  return <p role="status" className={`text-xs font-medium ${state.ok ? "text-emerald-700" : "text-red-600"}`}>{state.message}</p>;
}

export function WorkforceAssignmentForm({ employees, projects, sites, fixedEmployeeId, fixedProjectId }: {
  employees: SelectEmployee[];
  projects: Pick<ProjectRow, "id" | "name">[];
  sites: Pick<ProjectSiteRow, "id" | "project_id" | "name">[];
  fixedEmployeeId?: string;
  fixedProjectId?: string;
}) {
  const [state, action, pending] = useActionState(assignEmployeeAction, initialState);
  const [projectId, setProjectId] = useState(fixedProjectId ?? projects[0]?.id ?? "");
  const filteredSites = useMemo(() => sites.filter((site) => site.project_id === projectId), [sites, projectId]);
  return <form action={action} className="grid gap-3 rounded-lg bg-slate-50 p-4 md:grid-cols-2 xl:grid-cols-6">
    {fixedEmployeeId ? <input type="hidden" name="employeeId" value={fixedEmployeeId} /> : <select className={fieldControlClass} name="employeeId" aria-label="Employee" required defaultValue=""><option value="" disabled>Select employee</option>{employees.map((employee) => <option key={employee.id} value={employee.id}>{employee.fullName}</option>)}</select>}
    {fixedProjectId ? <input type="hidden" name="projectId" value={fixedProjectId} /> : <select className={fieldControlClass} name="projectId" aria-label="Project" required value={projectId} onChange={(event) => setProjectId(event.target.value)}><option value="" disabled>Select project</option>{projects.map((project) => <option key={project.id} value={project.id}>{project.name}</option>)}</select>}
    <select className={fieldControlClass} name="projectSiteId" aria-label="Project site" required defaultValue=""><option value="" disabled>Select site</option>{filteredSites.map((site) => <option key={site.id} value={site.id}>{site.name}</option>)}</select>
    <input className={fieldControlClass} name="positionTitle" aria-label="Assigned position" placeholder="Assigned position" required />
    <input className={fieldControlClass} name="startDate" aria-label="Start date" type="date" defaultValue={today} required />
    <input className={fieldControlClass} name="remarks" aria-label="Assignment remarks" placeholder="Remarks (optional)" />
    <div className="flex items-center gap-3 md:col-span-2 xl:col-span-6"><Button type="submit" size="sm" disabled={pending || !filteredSites.length}>{pending ? "Assigning…" : "Assign employee"}</Button><FormMessage state={state} />{!filteredSites.length && projectId && <p className="text-xs text-amber-700">This project has no active site.</p>}</div>
  </form>;
}

export function EndAssignmentForm({ assignment }: { assignment: EmployeeProjectAssignmentRow }) {
  const [state, action, pending] = useActionState(endEmployeeAssignmentAction, initialState);
  return <form action={action} className="flex flex-wrap items-center justify-end gap-2">
    <input type="hidden" name="assignmentId" value={assignment.id} /><input type="hidden" name="employeeId" value={assignment.employee_id} /><input type="hidden" name="projectId" value={assignment.project_id} />
    <input className="h-9 rounded-md border border-slate-200 px-2 text-xs" name="endDate" aria-label="Assignment end date" type="date" min={assignment.start_date} defaultValue={today < assignment.start_date ? assignment.start_date : today} required />
    <input className="h-9 min-w-40 rounded-md border border-slate-200 px-2 text-xs" name="remarks" aria-label="Assignment end reason" placeholder="End reason" required />
    <Button variant="outline" size="sm" disabled={pending}>{pending ? "Ending…" : "End"}</Button><FormMessage state={state} />
  </form>;
}

export function TransferAssignmentForm({ assignment, projects, sites }: {
  assignment: EmployeeProjectAssignmentRow;
  projects: Pick<ProjectRow, "id" | "name">[];
  sites: Pick<ProjectSiteRow, "id" | "project_id" | "name">[];
}) {
  const [state, action, pending] = useActionState(transferEmployeeAssignmentAction, initialState);
  const [projectId, setProjectId] = useState(projects[0]?.id ?? "");
  const filteredSites = useMemo(() => sites.filter((site) => site.project_id === projectId), [sites, projectId]);
  return <details className="mt-3 rounded-lg border border-slate-200 bg-slate-50 p-3"><summary className="cursor-pointer text-xs font-semibold text-slate-700">Transfer employee</summary><form action={action} className="mt-3 grid gap-3 md:grid-cols-2">
    <input type="hidden" name="assignmentId" value={assignment.id} /><input type="hidden" name="employeeId" value={assignment.employee_id} />
    <select className={fieldControlClass} name="projectId" aria-label="New project" value={projectId} onChange={(event) => setProjectId(event.target.value)} required><option value="" disabled>Select new project</option>{projects.map((project) => <option key={project.id} value={project.id}>{project.name}</option>)}</select>
    <select className={fieldControlClass} name="projectSiteId" aria-label="New project site" defaultValue="" required><option value="" disabled>Select new site</option>{filteredSites.map((site) => <option key={site.id} value={site.id}>{site.name}</option>)}</select>
    <input className={fieldControlClass} name="positionTitle" aria-label="New assigned position" placeholder="New assigned position" defaultValue={assignment.position_title} required />
    <input className={fieldControlClass} name="currentEndDate" aria-label="Current assignment end date" type="date" min={assignment.start_date} defaultValue={today} required />
    <input className={fieldControlClass} name="newStartDate" aria-label="New assignment start date" type="date" min={today} required />
    <input className={fieldControlClass} name="remarks" aria-label="Transfer remarks" placeholder="Transfer remarks (optional)" />
    <div className="flex items-center gap-3 md:col-span-2"><Button type="submit" size="sm" disabled={pending || !filteredSites.length}>{pending ? "Transferring…" : "Transfer"}</Button><FormMessage state={state} /></div>
  </form></details>;
}

export function LaborRateForm({ employeeId }: { employeeId: string }) {
  const [state, action, pending] = useActionState(addLaborRateAction, initialState);
  return <><AttendanceBasisForm employeeId={employeeId} /><form action={action} className="grid gap-3 rounded-lg bg-slate-50 p-4 sm:grid-cols-2 xl:grid-cols-5">
    <input type="hidden" name="employeeId" value={employeeId} />
    <select className={fieldControlClass} name="rateType" aria-label="Rate type" defaultValue="daily"><option value="daily">Daily</option><option value="hourly">Hourly</option></select>
    <PesoAmountInput name="amount" label="Rate amount (PHP)" required submitUngrouped />
    <input className={fieldControlClass} name="effectiveStartDate" aria-label="Effective start date" type="date" defaultValue={today} required />
    <input className={fieldControlClass} name="effectiveEndDate" aria-label="Effective end date" type="date" />
    <Button type="submit" disabled={pending}>{pending ? "Adding…" : "Add rate"}</Button>
    <div className="sm:col-span-2 xl:col-span-5"><FormMessage state={state} /></div>
  </form></>;
}

function AttendanceBasisForm({ employeeId }: { employeeId: string }) {
  const [state, action, pending] = useActionState(setAttendanceBasisAction, initialState);
  return <form action={action} className="mb-3 flex flex-wrap items-center gap-3 rounded-lg bg-slate-50 p-4"><input type="hidden" name="employeeId" value={employeeId} /><label className="text-sm">Attendance costing basis <select name="rateType" className={fieldControlClass} defaultValue="" required><option value="" disabled>Choose basis</option><option value="daily">Daily</option><option value="hourly">Hourly</option></select></label><Button disabled={pending}>Save basis</Button><FormMessage state={state} /></form>;
}

export function CloseLaborRateForm({ employeeId, rate }: { employeeId: string; rate: LaborRateRow }) {
  const [state, action, pending] = useActionState(closeLaborRateAction, initialState);
  return <form action={action} className="flex flex-wrap items-center justify-end gap-2"><input type="hidden" name="employeeId" value={employeeId} /><input type="hidden" name="rateId" value={rate.id} /><input className="h-9 rounded-md border border-slate-200 px-2 text-xs" name="effectiveEndDate" aria-label="Labor rate end date" type="date" min={rate.effective_start_date} defaultValue={today < rate.effective_start_date ? rate.effective_start_date : today} required /><Button variant="outline" size="sm" disabled={pending}>{pending ? "Closing…" : "Close rate"}</Button><FormMessage state={state} /></form>;
}

export function ArchiveEmployeeForm({ employeeId }: { employeeId: string }) {
  const [state, action, pending] = useActionState(archiveEmployeeAction, initialState);
  return <form action={action} className="flex flex-wrap items-center justify-end gap-2"><input type="hidden" name="id" value={employeeId} /><input className="h-10 min-w-52 rounded-lg border border-slate-200 px-3 text-sm" name="reason" placeholder="Separation / archive reason" required minLength={3} /><Button variant="outline" type="submit" disabled={pending}>{pending ? "Archiving…" : "Archive employee"}</Button><FormMessage state={state} /></form>;
}
