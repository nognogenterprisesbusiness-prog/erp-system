import { randomUUID } from "node:crypto";
import { notFound } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { PageHeader } from "@/components/ui/page-header";
import { HistoryPagination } from "@/components/ui/history-pagination";
import { AttendancePostDialog } from "./attendance-post-dialog";
import { readAllPages } from "@/lib/data/read-all-pages";

export async function ProjectSiteAttendance({ projectId, page, canRecord }: { projectId: string; page: number; canRecord: boolean }) {
  const db = await createClient();
  const today = new Intl.DateTimeFormat("sv-SE", { timeZone: "Asia/Manila" }).format(new Date());
  const project = await db.from("projects").select("code,name").eq("id", projectId).maybeSingle();
  if (project.error) throw new Error("Unable to load assigned project attendance.");
  if (!project.data) notFound();
  const sites = await db.from("project_sites").select("id").eq("project_id", projectId).eq("status", "active").order("id");
  if (sites.error) throw new Error("Unable to load assigned project sites.");
  const siteIds = (sites.data ?? []).map((site) => site.id);
  const [records, assignments] = await Promise.all([
    db.rpc("get_project_attendance_operations", { p_project_id: projectId, p_offset: (page - 1) * 20, p_limit: 20 }),
    siteIds.length ? readAllPages((from, to) => db.from("employee_project_assignments").select("id,employee_id,start_date,end_date")
      .eq("project_id", projectId).in("project_site_id", siteIds).eq("status", "active")
      .lte("start_date", today).or(`end_date.is.null,end_date.gte.${today}`).order("id").range(from, to), "assigned attendance workers")
      : Promise.resolve([]),
  ]);
  if (records.error) throw new Error("Unable to load assigned-project attendance.");
  const employeeIds = [...new Set([...assignments.map((assignment) => assignment.employee_id), ...records.data.map((record) => record.employee_id)])];
  const employees = employeeIds.length
    ? await db.from("employees").select("id,code,first_name,last_name").in("id", employeeIds)
    : { data: [], error: null };
  if (employees.error) throw new Error("Unable to load attendance employees.");
  const employeeById = new Map(employees.data?.map((employee) => [employee.id, employee]));
  const attendanceAssignments = assignments.map((assignment) => ({ ...assignment, employee: employeeById.get(assignment.employee_id) }));

  return <>
    <PageHeader title="Project attendance" description={`${project.data.code} · ${project.data.name}`} action={canRecord && attendanceAssignments.length > 0
      ? <AttendancePostDialog projectId={projectId} assignments={attendanceAssignments} idempotencyKey={randomUUID()} today={today} />
      : undefined} />
    <div className="mt-6 overflow-x-auto rounded-xl border border-slate-200 bg-white">
      <table className="w-full text-left text-sm">
        <thead><tr>{["Employee", "Date", "Attendance", "Hours", "Record"].map((label) => <th className="px-4 py-3" key={label}>{label}</th>)}</tr></thead>
        <tbody>{records.data.map((record) => <tr key={record.id} className="border-t border-slate-100">
          <td className="px-4 py-3">{employeeById.get(record.employee_id)?.first_name} {employeeById.get(record.employee_id)?.last_name}</td>
          <td className="px-4 py-3">{record.work_date}</td>
          <td className="px-4 py-3">{record.attendance_status}</td>
          <td className="px-4 py-3">{record.hours_worked}</td>
          <td className="px-4 py-3">{record.reversed ? "Reversed" : "Recorded"}</td>
        </tr>)}</tbody>
      </table>
      {!records.data.length && <p className="p-5 text-sm text-slate-500">No attendance records on this page.</p>}
    </div>
    <HistoryPagination path={`/projects/${projectId}/attendance`} page={page} count={records.data[0]?.total_count ?? 0} />
  </>;
}
