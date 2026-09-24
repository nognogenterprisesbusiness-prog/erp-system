import "server-only";
import { createClient } from "@/lib/supabase/server";

export async function getProjectAttendance(projectId: string, canManage: boolean) {
  const supabase = await createClient();
  const [entriesResult, costResult, assignmentsResult] = await Promise.all([
    supabase.from("project_attendance").select("id,employee_id,assignment_id,project_id,project_site_id,work_date,attendance_status,hours_worked,billable_units,rate_type,rate_snapshot,cost_total,note,created_at").eq("project_id", projectId).order("work_date", { ascending: false }).limit(100),
    supabase.rpc("get_project_labor_cost", { p_project_id: projectId }),
    canManage ? supabase.from("employee_project_assignments").select("id,employee_id,project_id,project_site_id,start_date,end_date,status").eq("project_id", projectId).order("start_date", { ascending: false }).limit(500) : Promise.resolve({ data: [], error: null }),
  ]);
  if (entriesResult.error || costResult.error || assignmentsResult.error) throw new Error("Unable to load project attendance.");
  const entries = entriesResult.data ?? [];
  const assignments = assignmentsResult.data ?? [];
  const employeeIds = [...new Set([...entries.map((entry) => entry.employee_id), ...assignments.map((assignment) => assignment.employee_id)])];
  const [employeesResult, reversalResult] = await Promise.all([
    employeeIds.length ? supabase.from("employees").select("id,code,first_name,last_name").in("id", employeeIds) : Promise.resolve({ data: [], error: null }),
    entries.length ? supabase.from("project_attendance_reversals").select("attendance_id,reason,reversed_at").in("attendance_id", entries.map((entry) => entry.id)) : Promise.resolve({ data: [], error: null }),
  ]);
  if (employeesResult.error || reversalResult.error) throw new Error("Unable to load attendance details.");
  const employees = new Map((employeesResult.data ?? []).map((employee) => [employee.id, employee]));
  const reversals = new Map((reversalResult.data ?? []).map((reversal) => [reversal.attendance_id, reversal]));
  return {
    entries: entries.map((entry) => ({ ...entry, employee: employees.get(entry.employee_id), reversal: reversals.get(entry.id) })),
    assignments: assignments.map((assignment) => ({ ...assignment, employee: employees.get(assignment.employee_id) })),
    costTotal: costResult.data ?? 0,
  };
}
