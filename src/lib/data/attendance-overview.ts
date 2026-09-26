import "server-only";

import { createClient } from "@/lib/supabase/server";

const PAGE_SIZE = 25;

export async function getAttendanceOverview(date: string, projectId: string | null, page: number) {
  const supabase = await createClient();
  const from = (page - 1) * PAGE_SIZE;
  let request = supabase.from("employee_project_assignments")
    .select("id,employee_id,project_id,project_site_id,start_date,end_date,position_title", { count: "exact" })
    .lte("start_date", date)
    .or(`end_date.is.null,end_date.gte.${date}`);
  if (projectId) request = request.eq("project_id", projectId);
  const { data: assignments, count, error } = await request.order("employee_id").order("id").range(from, from + PAGE_SIZE - 1);
  if (error) throw new Error("Unable to load attendance assignments.");
  const assignmentIds = (assignments ?? []).map((item) => item.id);
  const employeeIds = [...new Set((assignments ?? []).map((item) => item.employee_id))];
  const projectIds = [...new Set((assignments ?? []).map((item) => item.project_id))];
  const siteIds = [...new Set((assignments ?? []).map((item) => item.project_site_id))];
  const [employeeResult, projectResult, siteResult, entryResult] = await Promise.all([
    employeeIds.length ? supabase.from("employees").select("id,code,first_name,last_name").in("id", employeeIds) : Promise.resolve({ data: [], error: null }),
    projectIds.length ? supabase.from("projects").select("id,code,name").in("id", projectIds) : Promise.resolve({ data: [], error: null }),
    siteIds.length ? supabase.from("project_sites").select("id,name").in("id", siteIds) : Promise.resolve({ data: [], error: null }),
    assignmentIds.length ? supabase.from("project_attendance").select("id,assignment_id,attendance_status,hours_worked,rate_snapshot,cost_total,created_at").in("assignment_id", assignmentIds).eq("work_date", date).order("created_at", { ascending: false }) : Promise.resolve({ data: [], error: null }),
  ]);
  if (employeeResult.error || projectResult.error || siteResult.error || entryResult.error) throw new Error("Unable to load attendance details.");
  const entries = entryResult.data ?? [];
  const reversalResult = entries.length ? await supabase.from("project_attendance_reversals").select("attendance_id").in("attendance_id", entries.map((entry) => entry.id)) : { data: [], error: null };
  if (reversalResult.error) throw new Error("Unable to load attendance corrections.");
  const reversed = new Set((reversalResult.data ?? []).map((item) => item.attendance_id));
  const activeByAssignment = new Map<string, (typeof entries)[number]>();
  for (const entry of entries) if (!reversed.has(entry.id) && !activeByAssignment.has(entry.assignment_id)) activeByAssignment.set(entry.assignment_id, entry);
  const employees = new Map((employeeResult.data ?? []).map((item) => [item.id, item]));
  const projects = new Map((projectResult.data ?? []).map((item) => [item.id, item]));
  const sites = new Map((siteResult.data ?? []).map((item) => [item.id, item]));
  return {
    rows: (assignments ?? []).map((assignment) => ({
      ...assignment,
      employee: employees.get(assignment.employee_id),
      project: projects.get(assignment.project_id),
      site: sites.get(assignment.project_site_id),
      attendance: activeByAssignment.get(assignment.id),
    })),
    count: count ?? 0,
    page,
    pageCount: Math.max(1, Math.ceil((count ?? 0) / PAGE_SIZE)),
  };
}
