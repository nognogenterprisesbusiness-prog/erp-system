import { ActionDialog } from "@/components/ui/action-dialog";
import { notFound } from "next/navigation";
import { payrollStatusLabels, payrollTotals, philippinesDate, uuidSchema } from "@nognog/domain";
import { IntentLink as Link } from "@/components/layout/intent-link";
import { FinalizePayrollForm, MarkPayrollPaidForm, PayrollLineForm, VoidPayrollForm } from "@/components/payroll/payroll-forms";
import { Button } from "@/components/ui/button";
import { DataTableShell } from "@/components/ui/data-table-shell";
import { EmptyState } from "@/components/ui/empty-state";
import { PageHeader } from "@/components/ui/page-header";
import { tableHeadClass } from "@/components/ui/table-sort-heading";
import { requireFinanceViewer } from "@/lib/auth";
import { createClient } from "@/lib/supabase/server";

const money = new Intl.NumberFormat("en-PH", { style: "currency", currency: "PHP" });

export default async function PayrollDetailPage({ params }: { params: Promise<{ id: string }> }) {
  const user = await requireFinanceViewer();
  const { id } = await params;
  if (!uuidSchema.safeParse(id).success) notFound();
  const supabase = await createClient();
  const [run, lines, departments] = await Promise.all([
    supabase.from("payroll_runs").select("*").eq("id", id).maybeSingle(),
    supabase.from("payroll_lines").select("*").eq("run_id", id).order("employee_name").limit(1000),
    supabase.from("departments").select("id,name"),
  ]);
  if (run.error || lines.error || departments.error) throw new Error("Unable to load payroll.");
  if (!run.data) notFound();
  const payroll = run.data;
  const departmentName = new Map(departments.data.map((item) => [item.id, item.name]));
  const totals = payrollTotals(lines.data);
  const byDepartment = [...Map.groupBy(lines.data, (line) => line.department_id ?? "").entries()]
    .map(([departmentId, rows]) => ({ name: departmentId ? departmentName.get(departmentId) ?? "Department" : "No department", count: rows.length, ...payrollTotals(rows) }))
    .sort((a, b) => a.name.localeCompare(b.name));
  const draft = payroll.status === "draft";

  return <>
    <PageHeader eyebrow={payrollStatusLabels[payroll.status]} title={payroll.payroll_number} description={`${payroll.department_id ? departmentName.get(payroll.department_id) ?? "Department" : "All employees"} · ${payroll.period_start} – ${payroll.period_end} · Pay date ${payroll.pay_date}`}
      action={<div className="flex flex-wrap gap-2"><Button variant="outline" asChild><a href={`/payroll/${id}/export`}>Export CSV</a></Button><Button variant="outline" asChild><Link data-detail-back href="/payroll">All payroll</Link></Button></div>} />
    {payroll.status === "voided" && <p role="status" className="mt-5 rounded-lg border border-slate-200 bg-slate-50 px-4 py-3 text-sm text-slate-700">Voided · {payroll.void_reason}</p>}
    {payroll.status === "paid" && <p role="status" className="mt-5 rounded-lg border border-emerald-200 bg-emerald-50 px-4 py-3 text-sm text-emerald-800">Paid on {payroll.paid_on} · Reference {payroll.payment_reference}</p>}
    {payroll.notes && <p className="mt-4 text-sm text-slate-600">{payroll.notes}</p>}

    <section className="mt-6 grid gap-4 rounded-2xl border border-slate-200 bg-white p-5 sm:grid-cols-3 sm:p-6">
      {[["Gross pay", totals.gross], ["Deductions", totals.deductions], ["Net pay", totals.net]].map(([label, amount]) => <div key={label}><p className="text-xs text-slate-500">{label}</p><p className="mt-1 text-xl font-semibold tabular-nums">{money.format(Number(amount))}</p></div>)}
      {byDepartment.length > 1 && <div className="sm:col-span-3"><p className="text-xs font-medium text-slate-500">By department</p><ul className="mt-2 grid gap-2 text-sm sm:grid-cols-2 lg:grid-cols-3">{byDepartment.map((row) => <li key={row.name} className="flex justify-between gap-3 rounded-lg bg-slate-50 px-3 py-2"><span>{row.name} · {row.count}</span><span className="font-semibold tabular-nums">{money.format(row.net)}</span></li>)}</ul></div>}
    </section>

    <div className="mt-6"><DataTableShell empty={lines.data.length === 0 ? <EmptyState compact title="No employees in this payroll" /> : undefined} footer={<p className="text-xs text-slate-500">{lines.data.length} employees · attendance pay comes from posted attendance{draft ? " and is recalculated when Admin finalizes" : ""}</p>}>
      <table className="w-full min-w-[900px] text-left text-sm"><thead className={tableHeadClass}><tr><th className="px-5 py-3">Employee</th><th className="px-4 py-3 text-right">Days</th><th className="px-4 py-3 text-right">Attendance pay</th><th className="px-4 py-3">{draft ? "Other earnings · deductions · note" : "Other earnings / deductions"}</th><th className="px-5 py-3 text-right">Net pay</th></tr></thead>
        <tbody className="divide-y divide-slate-100">{lines.data.map((line) => <tr key={line.id} className="align-top">
          <td className="px-5 py-4"><p className="font-medium text-slate-800">{line.employee_name}</p><p className="mt-1 text-xs text-slate-500">{line.employee_code} · {line.department_id ? departmentName.get(line.department_id) ?? "Department" : "No department"}</p></td>
          <td className="px-4 py-4 text-right tabular-nums">{line.days_worked}</td>
          <td className="px-4 py-4 text-right tabular-nums">{money.format(line.attendance_pay)}</td>
          <td className="px-4 py-4">{draft ? <PayrollLineForm runId={id} line={line} /> : <><span className="tabular-nums">+{money.format(line.other_earnings)} / −{money.format(line.deductions)}</span>{line.notes && <span className="block text-xs text-slate-500">{line.notes}</span>}</>}</td>
          <td className="px-5 py-4 text-right font-semibold tabular-nums">{money.format(line.net_pay)}</td>
        </tr>)}</tbody></table>
    </DataTableShell></div>

    {payroll.status !== "voided" && <section className="mt-6 grid gap-6 rounded-2xl border border-slate-200 bg-white p-5 sm:p-6 lg:grid-cols-2">
      <div>
        <h2 className="text-base font-semibold">Next step</h2>
        <div className="mt-3">
          {draft && (user.canManage ? <FinalizePayrollForm runId={id} /> : <p className="text-sm text-slate-600">Enter other earnings and deductions, then ask Admin to finalize.</p>)}
          {payroll.status === "finalized" && <MarkPayrollPaidForm runId={id} today={philippinesDate()} />}
          {payroll.status === "paid" && <p className="text-sm text-slate-600">This payroll is complete.</p>}
        </div>
      </div>
      {user.canManage && <ActionDialog title="Void payroll" description="Enter a reason to void this payroll. The record is retained so a corrected payroll can be created for the same period."><div className="mt-3"><VoidPayrollForm runId={id} /></div><p className="mt-2 text-xs text-slate-500">Voiding keeps the record and lets you create a corrected payroll for the same period.</p></ActionDialog>}
    </section>}
  </>;
}
