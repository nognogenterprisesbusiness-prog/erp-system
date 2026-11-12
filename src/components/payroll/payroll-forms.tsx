"use client";

import { MoneyInput } from "@/components/ui/money-input";
import { useActionState, useState } from "react";
import { Button } from "@/components/ui/button";
import { DatePicker } from "@/components/ui/date-picker";
import { FormField, fieldControlClass } from "@/components/ui/form-field";
import { RecordFormControls } from "@/components/ui/record-create-dialog";
import { SelectPicker } from "@/components/ui/select-picker";
import { createPayrollAction, finalizePayrollAction, markPayrollPaidAction, saveDepartmentAction, setEmployeeDepartmentAction, updatePayrollLineAction, voidPayrollAction, type PayrollActionState } from "./payroll-actions";

const initial: PayrollActionState = { message: "" };
type Department = { id: string; name: string };

function Message({ state }: { state: PayrollActionState }) {
  if (!state.message) return null;
  return <p role={state.ok ? "status" : "alert"} className={`text-sm ${state.ok ? "text-emerald-700" : "text-red-700"}`}>{state.message}</p>;
}

export function NewPayrollForm({ departments, idempotencyKey, defaults }: { departments: Department[]; idempotencyKey: string; defaults: { start: string; end: string; pay: string } }) {
  const [state, action, pending] = useActionState(createPayrollAction, initial);
  const [departmentId, setDepartmentId] = useState("");
  const error = (name: string) => state.fieldErrors?.[name]?.[0];
  return <form action={action} className="space-y-5">
    <input type="hidden" name="idempotencyKey" value={idempotencyKey} /><input type="hidden" name="departmentId" value={departmentId} />
    <FormField label="Department" htmlFor="payrollDepartment" hint="Leave as All employees, or pay one department at a time."><SelectPicker id="payrollDepartment" label="Department" value={departmentId || "all"} onValueChange={(value) => setDepartmentId(value === "all" ? "" : value)} options={[{ value: "all", label: "All employees" }, ...departments.map((item) => ({ value: item.id, label: item.name }))]} /></FormField>
    <div className="grid gap-4 sm:grid-cols-3">
      <FormField label="Period start" htmlFor="periodStart" error={error("periodStart")}><DatePicker id="periodStart" name="periodStart" label="Period start" defaultValue={defaults.start} allowClear={false} required /></FormField>
      <FormField label="Period end" htmlFor="periodEnd" error={error("periodEnd")}><DatePicker id="periodEnd" name="periodEnd" label="Period end" defaultValue={defaults.end} allowClear={false} required /></FormField>
      <FormField label="Pay date" htmlFor="payDate" error={error("payDate")}><DatePicker id="payDate" name="payDate" label="Pay date" defaultValue={defaults.pay} allowClear={false} required /></FormField>
    </div>
    <FormField label="Note (optional)" htmlFor="payrollNotes"><input id="payrollNotes" name="notes" maxLength={500} className={fieldControlClass} /></FormField>
    <p className="text-xs leading-5 text-slate-500">Each active employee gets a line with pay from posted attendance in the period. Add salaries, allowances and deductions on the next screen.</p>
    <Message state={state} />
    <RecordFormControls busy={pending} label="Create payroll" />
  </form>;
}

export function PayrollLineForm({ runId, line }: { runId: string; line: { id: string; other_earnings: number; deductions: number; notes: string } }) {
  const [state, action, pending] = useActionState(updatePayrollLineAction, initial);
  return <form action={action} className="flex flex-wrap items-end gap-2">
    <input type="hidden" name="runId" value={runId} /><input type="hidden" name="lineId" value={line.id} />
    <label className="grid gap-1 text-[11px] font-medium text-slate-500">Other earnings<MoneyInput name="otherEarnings" defaultValue={Number(line.other_earnings).toFixed(2)} inputMode="decimal" maxLength={10} className={`${fieldControlClass} h-9 w-28 text-right`} /></label>
    <label className="grid gap-1 text-[11px] font-medium text-slate-500">Deductions<MoneyInput name="deductions" defaultValue={Number(line.deductions).toFixed(2)} inputMode="decimal" maxLength={10} className={`${fieldControlClass} h-9 w-28 text-right`} /></label>
    <label className="grid gap-1 text-[11px] font-medium text-slate-500">Note<input name="notes" defaultValue={line.notes} maxLength={300} placeholder="e.g. Salary; SSS" className={`${fieldControlClass} h-9 w-40`} /></label>
    <Button type="submit" size="sm" variant="outline" disabled={pending}>{pending ? "Saving…" : "Save"}</Button>
    {state.message && <span role={state.ok ? "status" : "alert"} className={`basis-full text-xs ${state.ok ? "text-emerald-700" : "text-red-700"}`}>{state.message}</span>}
  </form>;
}

export function FinalizePayrollForm({ runId }: { runId: string }) {
  const [state, action, pending] = useActionState(finalizePayrollAction, initial);
  return <form action={action} className="space-y-2"><input type="hidden" name="runId" value={runId} />
    <p className="text-xs text-slate-500">Finalizing recalculates attendance pay and locks every line.</p>
    <Button type="submit" disabled={pending}>{pending ? "Finalizing…" : "Finalize payroll"}</Button><Message state={state} /></form>;
}

export function MarkPayrollPaidForm({ runId, today }: { runId: string; today: string }) {
  const [state, action, pending] = useActionState(markPayrollPaidAction, initial);
  return <form action={action} className="flex flex-wrap items-end gap-3"><input type="hidden" name="runId" value={runId} />
    <FormField label="Paid on" htmlFor="paidOn"><DatePicker id="paidOn" name="paidOn" label="Paid on" defaultValue={today} maxDate={today} allowClear={false} required /></FormField>
    <FormField label="Payment reference" htmlFor="paymentReference" error={state.fieldErrors?.reference?.[0]}><input id="paymentReference" name="reference" required minLength={2} maxLength={120} placeholder="e.g. Bank batch 1102" className={fieldControlClass} /></FormField>
    <Button type="submit" disabled={pending}>{pending ? "Saving…" : "Mark as paid"}</Button>
    <div className="basis-full"><Message state={state} /></div></form>;
}

export function VoidPayrollForm({ runId }: { runId: string }) {
  const [state, action, pending] = useActionState(voidPayrollAction, initial);
  return <form action={action} className="grid gap-2"><input type="hidden" name="runId" value={runId} />
    <FormField label="Reason" htmlFor="voidReason" error={state.fieldErrors?.reason?.[0]}><input id="voidReason" name="reason" required minLength={3} maxLength={500} className={fieldControlClass} /></FormField>
    <RecordFormControls busy={pending} label="Confirm void payroll" /><Message state={state} /></form>;
}

export function DepartmentForm({ department }: { department?: Department }) {
  const [state, action, pending] = useActionState(saveDepartmentAction, initial);
  return <form action={action} className="grid gap-4"><input type="hidden" name="id" value={department?.id ?? ""} />
    <label className="grid gap-2 text-sm font-medium text-slate-700">Department name<input name="name" defaultValue={department?.name} required minLength={2} maxLength={80} placeholder="e.g. Office staff" className={fieldControlClass} disabled={pending} /></label>
    {state.message && <p role={state.ok ? "status" : "alert"} className={`text-sm ${state.ok ? "text-emerald-700" : "text-red-700"}`}>{state.message}</p>}
    <RecordFormControls busy={pending} success={state.ok} label={department ? "Save name" : "Add department"} />
  </form>;
}

export function EmployeeDepartmentForm({ employeeId, current, departments }: { employeeId: string; current: string | null; departments: Department[] }) {
  const [state, action, pending] = useActionState(setEmployeeDepartmentAction, initial);
  const [value, setValue] = useState(current ?? "");
  return <form action={action} className="flex flex-wrap items-end gap-2"><input type="hidden" name="employeeId" value={employeeId} /><input type="hidden" name="departmentId" value={value} />
    <div className="w-56"><SelectPicker label="Department" value={value || "none"} onValueChange={(next) => setValue(next === "none" ? "" : next)} options={[{ value: "none", label: "No department" }, ...departments.map((item) => ({ value: item.id, label: item.name }))]} /></div>
    <Button type="submit" size="sm" variant="outline" disabled={pending || value === (current ?? "")}>{pending ? "Saving…" : "Save"}</Button>
    {state.message && <span role={state.ok ? "status" : "alert"} className={`basis-full text-xs ${state.ok ? "text-emerald-700" : "text-red-700"}`}>{state.message}</span>}
  </form>;
}
