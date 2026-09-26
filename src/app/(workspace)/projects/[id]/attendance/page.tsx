import { randomUUID } from "node:crypto";
import { IntentLink as Link } from "@/components/layout/intent-link";
import { uuidSchema } from "@nognog/domain";
import { notFound } from "next/navigation";
import { ReverseAttendanceForm } from "@/components/workforce/attendance-forms";
import { AttendancePostDialog } from "@/components/workforce/attendance-post-dialog";
import { Button } from "@/components/ui/button";
import { DataTableShell } from "@/components/ui/data-table-shell";
import { EmptyState } from "@/components/ui/empty-state";
import { PageHeader } from "@/components/ui/page-header";
import { tableHeadClass } from "@/components/ui/table-sort-heading";
import { requireFinanceViewer } from "@/lib/auth";
import { getProjectAttendance } from "@/lib/data/project-attendance";
import { createClient } from "@/lib/supabase/server";

const money = (amount: number) => new Intl.NumberFormat("en-PH", { style: "currency", currency: "PHP" }).format(amount);

export default async function ProjectAttendancePage({ params, searchParams }: { params: Promise<{ id: string }>; searchParams: Promise<{ posted?: string }> }) {
  const user = await requireFinanceViewer();
  const id = (await params).id;
  if (!uuidSchema.safeParse(id).success) notFound();
  const supabase = await createClient();
  const [summaryResult, data] = await Promise.all([
    supabase.rpc("get_project_management_summary", { p_project_id: id }),
    getProjectAttendance(id, user.canManage),
  ]);
  if (summaryResult.error || !summaryResult.data?.[0]) throw new Error("Unable to load project attendance summary.");
  const summary = summaryResult.data[0];
  const posted = (await searchParams).posted;
  const today = new Intl.DateTimeFormat("sv-SE", { timeZone: "Asia/Manila", year: "numeric", month: "2-digit", day: "2-digit" }).format(new Date());
  return <>
    <PageHeader title="Attendance & labor cost" description={`${summary.project_code} · ${summary.project_name}`} action={<div className="flex flex-wrap items-center gap-2">{user.canManage && data.assignments.length > 0 && <AttendancePostDialog projectId={id} assignments={data.assignments} idempotencyKey={randomUUID()} today={today} />}<Button variant="outline" asChild><Link href={`/projects/${id}/costs`}>Back to project costs</Link></Button></div>} />
    {posted && ["attendance", "reversal"].includes(posted) && <p role="status" className="mt-5 rounded-lg border border-emerald-200 bg-emerald-50 px-4 py-3 text-sm text-emerald-800">{posted === "attendance" ? "Attendance and its labor cost posted." : "Attendance reversed. Historical record retained."}</p>}
    <div className="mt-7 rounded-xl border border-slate-200 bg-white p-5"><p className="text-xs text-slate-500">Net posted labor cost</p><p className="mt-1 text-2xl font-semibold text-slate-900">{money(data.costTotal)}</p></div>
    {user.canManage && data.assignments.length === 0 && <div className="mt-5 rounded-xl border border-slate-200 bg-white"><EmptyState title="No employee assignments" description="Assign an employee to this project before posting attendance." /></div>}
    <h2 className="mt-8 text-lg font-semibold text-slate-900">Attendance history</h2>
    <DataTableShell empty={data.entries.length === 0 ? <EmptyState compact title="No attendance posted" /> : undefined} footer={<span className="text-xs text-slate-500">Showing {data.entries.length} most recent entries</span>}>
      <table className="w-full min-w-[730px] text-left text-sm"><thead className={tableHeadClass}><tr><th className="px-5 py-3">Employee</th><th className="px-4 py-3">Date</th><th className="px-4 py-3">Status / hours</th><th className="px-4 py-3 text-right">Cost</th><th className="px-5 py-3">Correction</th></tr></thead><tbody className="divide-y divide-slate-100">{data.entries.map((entry) => <tr key={entry.id}><td className="px-5 py-4"><p className="font-medium text-slate-900">{entry.employee?.code ?? "Employee"} · {entry.employee?.first_name} {entry.employee?.last_name}</p><p className="mt-1 text-xs text-slate-500">{entry.note}</p></td><td className="px-4 py-4">{entry.work_date}</td><td className="px-4 py-4 capitalize">{entry.attendance_status} · {entry.hours_worked} h{entry.rate_type === "daily" && <span className="block text-xs text-slate-500">{entry.billable_units} paid day</span>}</td><td className="px-4 py-4 text-right font-medium">{entry.reversal ? "—" : money(entry.cost_total)}</td><td className="px-5 py-4">{entry.reversal ? <span className="text-xs text-slate-500">Reversed · {entry.reversal.reason}</span> : user.canManage ? <details className="max-w-xs"><summary className="cursor-pointer text-xs font-medium text-cyan-700">Correct</summary><div className="mt-3"><ReverseAttendanceForm projectId={id} attendanceId={entry.id} idempotencyKey={randomUUID()} /></div></details> : <span className="text-xs text-emerald-700">Posted</span>}</td></tr>)}</tbody></table>
    </DataTableShell>
  </>;
}
