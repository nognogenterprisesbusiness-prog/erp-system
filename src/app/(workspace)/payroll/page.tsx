import { readAllPages } from "@/lib/data/read-all-pages";
import { RecordViewLink } from "@/components/ui/record-view-link";
import { randomUUID } from "node:crypto";
import { payrollStatusLabels, philippinesDate } from "@nognog/domain";
import { IntentLink as Link } from "@/components/layout/intent-link";
import { DepartmentForm, NewPayrollForm } from "@/components/payroll/payroll-forms";
import { DataTableShell } from "@/components/ui/data-table-shell";
import { EmptyState } from "@/components/ui/empty-state";
import { HistoryPagination } from "@/components/ui/history-pagination";
import { PageHeader } from "@/components/ui/page-header";
import { RecordCreateDialog } from "@/components/ui/record-create-dialog";
import { tableHeadClass } from "@/components/ui/table-sort-heading";
import { requireFinanceViewer } from "@/lib/auth";
import { pageNumber } from "@/lib/data/pagination";
import { createClient } from "@/lib/supabase/server";

const money = new Intl.NumberFormat("en-PH", { style: "currency", currency: "PHP" });
const statusTone = { draft: "bg-amber-50 text-amber-800", finalized: "bg-cyan-50 text-cyan-800", paid: "bg-emerald-50 text-emerald-700", voided: "bg-slate-100 text-slate-600" } as const;

/** Half-month default: 1–15 or 16–end of the current Philippine month. */
function defaultPeriod(today: string) {
  const [year, month, day] = today.split("-").map(Number);
  const lastDay = new Date(Date.UTC(year, month, 0)).getUTCDate();
  const pad = (value: number) => String(value).padStart(2, "0");
  const prefix = `${year}-${pad(month)}`;
  return Number(day) <= 15 ? { start: `${prefix}-01`, end: `${prefix}-15`, pay: `${prefix}-15` } : { start: `${prefix}-16`, end: `${prefix}-${pad(lastDay)}`, pay: `${prefix}-${pad(lastDay)}` };
}

export default async function PayrollPage({ searchParams }: { searchParams: Promise<{ page?: string }> }) {
  const user = await requireFinanceViewer();
  const page = pageNumber((await searchParams).page);
  const pageSize = 20;
  const supabase = await createClient();
  const [runs, departments] = await Promise.all([
    supabase.from("payroll_runs").select("*", { count: "exact" }).order("period_start", { ascending: false }).order("created_at", { ascending: false }).range((page - 1) * pageSize, page * pageSize - 1),
    readAllPages((from,to)=>supabase.from("departments").select("id,name,archived_at").order("id").range(from,to),"departments").then(data=>({data,error:null})),
  ]);
  if (runs.error || departments.error) throw new Error("Unable to load payroll.");
  const runIds = runs.data.map((run) => run.id);
  const totals = await supabase.rpc("get_payroll_totals", { p_run_ids: runIds });
  if (totals.error) throw new Error("Unable to load complete payroll totals.");
  const activeDepartments = departments.data.filter((item) => !item.archived_at);
  const departmentName = new Map(departments.data.map((item) => [item.id, item.name]));
  const totalsByRun = new Map((totals.data ?? []).map(row => [row.run_id, row]));

  return <>
    <PageHeader title="Payroll" description="Pay employees from posted attendance, plus salaries, allowances and deductions you enter." action={<RecordCreateDialog title="New payroll" triggerLabel="New payroll"><NewPayrollForm departments={activeDepartments} idempotencyKey={randomUUID()} defaults={defaultPeriod(philippinesDate())} /></RecordCreateDialog>} />
    <p className="mt-4 max-w-3xl text-xs leading-5 text-slate-500">Review pay, finalize, then record payment. Government deductions are entered manually.</p>
    <div className="mt-6"><DataTableShell empty={runs.data.length === 0 ? <EmptyState title="No payroll yet" description="Use New payroll to pay a period." /> : undefined}>
      <table className="w-full min-w-[760px] text-left text-sm"><thead className={tableHeadClass}><tr><th className="px-5 py-3">Payroll</th><th className="px-4 py-3">Department</th><th className="px-4 py-3">Period / pay date</th><th className="px-4 py-3 text-right">Employees</th><th className="px-4 py-3 text-right">Net pay</th><th className="px-5 py-3">Status</th><th data-record-actions className="px-5 py-3 text-right bg-slate-50">Actions</th></tr></thead>
        <tbody className="divide-y divide-slate-100">{runs.data.map((run) => {
          const summary = totalsByRun.get(run.id);
          return <tr key={run.id} className="hover:bg-slate-50/70">
            <td className="px-5 py-4 font-semibold"><Link href={`/payroll/${run.id}`} className="text-slate-900 hover:text-cyan-700">{run.payroll_number}</Link></td>
            <td className="px-4 py-4 text-slate-600">{run.department_id ? departmentName.get(run.department_id) ?? "Department" : "All employees"}</td>
            <td className="px-4 py-4 text-slate-600">{run.period_start} – {run.period_end}<span className="block text-xs text-slate-500">Pay {run.pay_date}</span></td>
            <td className="px-4 py-4 text-right">{summary?.employee_count ?? 0}</td>
            <td className="px-4 py-4 text-right font-semibold tabular-nums">{money.format(summary?.net ?? 0)}</td>
            <td className="px-5 py-4"><span className={`rounded-full px-2.5 py-1 text-xs font-semibold ${statusTone[run.status]}`}>{payrollStatusLabels[run.status]}</span></td>
            <td data-record-actions className="px-5 py-4 text-right bg-white"><RecordViewLink href={`/payroll/${run.id}`} name={`payroll ${run.payroll_number}`} /></td>
          </tr>;
        })}</tbody></table>
    </DataTableShell></div>
    <HistoryPagination path="/payroll" page={page} count={runs.count ?? 0} pageSize={pageSize} />
    <section className="mt-8 overflow-hidden rounded-xl border border-slate-200 bg-white">
      <div className="flex flex-wrap items-start justify-between gap-4 p-5 sm:p-6"><div><h2 className="text-lg font-semibold">Departments <span className="ml-2 text-sm font-normal text-slate-500">{activeDepartments.length}</span></h2><p className="mt-1 max-w-xl text-sm leading-6 text-slate-500">Group employees for payroll. Choose their department when editing an employee.</p></div>
        {user.canManage && <RecordCreateDialog size="sm" title="Add department" triggerLabel="Add department"><DepartmentForm /></RecordCreateDialog>}
      </div>
      {activeDepartments.length === 0 ? <div className="border-t border-slate-100 px-5 py-6 sm:px-6"><p className="text-sm font-medium text-slate-700">No departments yet</p><p className="mt-1 text-sm text-slate-500">{user.canManage ? "Add your first department, such as Office staff or Site crew." : "An Admin can add departments for payroll."}</p></div> : <ul className="divide-y divide-slate-100 border-t border-slate-100">
        {activeDepartments.map((item) => <li key={item.id} className="flex items-center justify-between gap-4 px-5 py-4 sm:px-6"><span className="min-w-0 break-words text-sm font-medium">{item.name}</span>{user.canManage && <RecordCreateDialog size="sm" title={`Rename ${item.name}`} triggerLabel="Rename" triggerSize="sm" triggerVariant="outline" triggerIcon={null}><DepartmentForm department={item} /></RecordCreateDialog>}</li>)}
      </ul>}
    </section>
  </>;
}
