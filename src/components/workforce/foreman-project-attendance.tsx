import { randomUUID } from "node:crypto";
import { createClient } from "@/lib/supabase/server";
import { PageHeader } from "@/components/ui/page-header";
import { HistoryPagination } from "@/components/ui/history-pagination";
import { AttendancePostDialog } from "./attendance-post-dialog";
export async function ForemanProjectAttendance({ projectId, page }: { projectId: string; page: number }) {
  const db = await createClient();
  const [project, records, assignments] = await Promise.all([
    db.from("projects").select("code,name").eq("id", projectId).single(),
    db.rpc("get_project_attendance_operations", { p_project_id: projectId, p_offset: (page - 1) * 20, p_limit: 20 }),
    db.from("employee_project_assignments").select("id,employee_id,start_date,end_date").eq("project_id", projectId).eq("status", "active").order("id").range(0, 19),
  ]);
  if (project.error || records.error || assignments.error) throw new Error("Unable to load assigned-project attendance.");
  const ids = [...new Set([...assignments.data.map((a) => a.employee_id), ...records.data.map((a) => a.employee_id)])];
  const employees = ids.length ? await db.from("employees").select("id,code,first_name,last_name").in("id", ids) : { data: [], error: null };
  if (employees.error) throw new Error("Unable to load attendance employees.");
  const names = new Map(employees.data?.map((e) => [e.id, e]));
  const today = new Intl.DateTimeFormat("sv-SE", { timeZone: "Asia/Manila" }).format(new Date());
  return <><PageHeader title="Project attendance" description={`${project.data.code} · ${project.data.name}`} action={<AttendancePostDialog projectId={projectId} assignments={assignments.data.map((a) => ({ ...a, employee: names.get(a.employee_id) }))} idempotencyKey={randomUUID()} today={today} />} /><div className="mt-6 overflow-x-auto rounded-xl border border-slate-200 bg-white"><table className="w-full text-left text-sm"><thead><tr>{["Employee", "Date", "Attendance", "Hours", "Record"].map((label) => <th className="px-4 py-3" key={label}>{label}</th>)}</tr></thead><tbody>{records.data.map((a) => <tr key={a.id} className="border-t border-slate-100"><td className="px-4 py-3">{names.get(a.employee_id)?.first_name} {names.get(a.employee_id)?.last_name}</td><td className="px-4 py-3">{a.work_date}</td><td className="px-4 py-3">{a.attendance_status}</td><td className="px-4 py-3">{a.hours_worked}</td><td className="px-4 py-3">{a.reversed ? "Reversed" : "Recorded"}</td></tr>)}</tbody></table>{!records.data.length && <p className="p-5 text-sm text-slate-500">No attendance records on this page.</p>}</div><HistoryPagination path={`/projects/${projectId}/attendance`} page={page} count={records.data[0]?.total_count ?? 0} /></>;
}
