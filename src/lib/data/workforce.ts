import "server-only";
import { cache } from "react";
import { notFound } from "next/navigation";
import { uuidSchema } from "@nognog/domain";
import { createClient } from "@/lib/supabase/server";
import { safeSearchTerm } from "./search";
import { readCountedPage } from "./read-counted-page";
import { readAllPages, readByIds } from "./read-all-pages";
import type {
  EmployeeCategoryRow,
  EmployeeProjectAssignmentRow,
  EmployeeRow,
  EmployeeStatus,
  LaborRateRow,
} from "@/types/database";

const PAGE_SIZE = 25;
export const employeeFullName = (employee: Pick<EmployeeRow, "first_name" | "middle_name" | "last_name">) =>
  [employee.first_name, employee.middle_name, employee.last_name].filter(Boolean).join(" ");

export type EmployeeListView = EmployeeRow & { categoryName: string; fullName: string; activeProjects: string[]; contactNumber: string | null; emailAddress: string | null };
export type WorkforceAssignmentView = EmployeeProjectAssignmentRow & {
  projectName: string;
  siteName: string;
  assignedByName: string;
};

export const getEmployeeCategories = cache(async function getEmployeeCategories(includeArchived = false) {
  const supabase = await createClient();
  let query = supabase.from("employee_categories").select("id,name,description,created_by,updated_by,archived_at,archived_by,created_at,updated_at").order("name").order("id");
  if (!includeArchived) query = query.is("archived_at", null);
  return readAllPages((from, to) => query.range(from, to), "employee categories");
});

export async function getEmployees(params: { query?: string; categoryId?: string; status?: EmployeeStatus | "all"; projectId?: string; page?: number } = {}) {
  const supabase = await createClient();
  const page = Math.max(1, params.page ?? 1);
  const from = (page - 1) * PAGE_SIZE;
  let employeeIds: string[] | undefined;
  if (params.projectId) {
    const scopedAssignments = await readAllPages((from, to) => supabase.from("employee_project_assignments").select("id,employee_id").eq("project_id", params.projectId!).eq("status", "active").order("id").range(from, to), "project workforce filter");
    employeeIds = [...new Set(scopedAssignments.map((item) => item.employee_id))];
    if (employeeIds.length === 0) return { employees: [] as EmployeeListView[], count: 0, page, pageCount: 1 };
  }
  let request = supabase.from("employees").select("id,code,first_name,middle_name,last_name,category_id,employment_type,status,hire_date,profile_id,created_by,updated_by,archived_at,archived_by,created_at,updated_at", { count: "exact" });
  const search = safeSearchTerm(params.query);
  if (search) request = request.or(`code.ilike.%${search}%,first_name.ilike.%${search}%,middle_name.ilike.%${search}%,last_name.ilike.%${search}%,employment_type.ilike.%${search}%`);
  if (params.categoryId) request = request.eq("category_id", params.categoryId);
  if (params.status && params.status !== "all") request = request.eq("status", params.status);
  else request = request.is("archived_at", null);
  if (employeeIds) request = request.in("id", employeeIds);
  const { data: employees, count, error } = await request.order("last_name").order("first_name").range(from, from + PAGE_SIZE - 1);
  if (error) throw new Error("Unable to load employees.");
  const ids = (employees ?? []).map((employee) => employee.id);
  const categoryIds = [...new Set((employees ?? []).map((employee) => employee.category_id))];
  const [{ data: categories, error: categoryError }, { data: assignments, error: assignmentError }, { data: contacts, error: contactError }] = await Promise.all([
    categoryIds.length ? supabase.from("employee_categories").select("id,name").in("id", categoryIds) : Promise.resolve({ data: [], error: null }),
    ids.length ? supabase.from("employee_project_assignments").select("employee_id,project_id").in("employee_id", ids).eq("status", "active") : Promise.resolve({ data: [], error: null }),
    ids.length ? supabase.from("employee_private_contacts").select("employee_id,contact_number,email_address").in("employee_id", ids) : Promise.resolve({ data: [], error: null }),
  ]);
  if (categoryError || assignmentError || contactError) throw new Error("Unable to resolve employee reference data.");
  const projectIds = [...new Set((assignments ?? []).map((item) => item.project_id))];
  const { data: projects, error: projectError } = projectIds.length ? await supabase.from("projects").select("id,name").in("id", projectIds) : { data: [], error: null };
  if (projectError) throw new Error("Unable to resolve employee projects.");
  const categoryMap = new Map((categories ?? []).map((item) => [item.id, item.name]));
  const projectMap = new Map((projects ?? []).map((item) => [item.id, item.name]));
  const contactMap = new Map((contacts ?? []).map((item) => [item.employee_id, item]));
  const assignmentsByEmployee = new Map<string, string[]>();
  for (const assignment of assignments ?? []) {
    const projectName = projectMap.get(assignment.project_id);
    if (projectName) assignmentsByEmployee.set(assignment.employee_id, [...(assignmentsByEmployee.get(assignment.employee_id) ?? []), projectName]);
  }
  return {
    employees: (employees ?? []).map((employee): EmployeeListView => ({
      ...employee,
      fullName: employeeFullName(employee),
      categoryName: categoryMap.get(employee.category_id) ?? "Unavailable category",
      activeProjects: assignmentsByEmployee.get(employee.id) ?? [],
      contactNumber: contactMap.get(employee.id)?.contact_number ?? null,
      emailAddress: contactMap.get(employee.id)?.email_address ?? null,
    })),
    count: count ?? 0,
    page,
    pageCount: Math.max(1, Math.ceil((count ?? 0) / PAGE_SIZE)),
  };
}

export async function getEmployee(id: string, pages: { assignments?: number; rates?: number; events?: number; attendance?: number } = {}) {
  if (!uuidSchema.safeParse(id).success) notFound();
  const supabase = await createClient();
  const { data: employee, error } = await supabase.from("employees").select("*").eq("id", id).maybeSingle();
  if (error) throw new Error(`Unable to load employee: ${error.message}`, { cause: error });
  if (!employee) notFound();
  const [categoryResult, contactResult, assignmentResult, rateResult, eventResult, attendanceResult, categories, linkedProfileResult] = await Promise.all([
    supabase.from("employee_categories").select("*").eq("id", employee.category_id).single(),
    supabase.from("employee_private_contacts").select("employee_id,contact_number,email_address,updated_by,updated_at").eq("employee_id", id).maybeSingle(),
    readCountedPage((from, to) => supabase.from("employee_project_assignments").select("*", { count: "exact" }).eq("employee_id", id).order("start_date", { ascending: false }).order("id").range(from, to), pages.assignments ?? 1, "employee assignments"),
    readCountedPage((from, to) => supabase.from("labor_rates").select("*", { count: "exact" }).eq("employee_id", id).order("effective_start_date", { ascending: false }).order("id").range(from, to), pages.rates ?? 1, "labor rate history"),
    readCountedPage((from, to) => supabase.from("employee_events").select("*", { count: "exact" }).eq("employee_id", id).order("occurred_at", { ascending: false }).order("id").range(from, to), pages.events ?? 1, "employee history"),
    readCountedPage((from, to) => supabase.from("project_attendance").select("id,project_id,work_date,attendance_status,hours_worked,note", { count: "exact" }).eq("employee_id", id).order("work_date", { ascending: false }).order("id").range(from, to), pages.attendance ?? 1, "employee attendance"),
    getEmployeeCategories(),
    employee.profile_id ? supabase.from("profiles").select("id,full_name,email").eq("id", employee.profile_id).maybeSingle() : { data: null, error: null },
  ]);
  if (categoryResult.error || contactResult.error || linkedProfileResult.error) throw new Error("Unable to load the employee record.");
  const assignments = assignmentResult.data;
  const rateRows = rateResult.data;
  const eventRows = eventResult.data;
  const [projects, sites, attendanceReversals] = await Promise.all([
    readByIds([...new Set([...assignments.map(row => row.project_id), ...attendanceResult.data.map(row => row.project_id)])], (ids, from, to) => supabase.from("projects").select("id,name").in("id", ids).order("id").range(from, to), "employee project names"),
    readByIds([...new Set(assignments.map(row => row.project_site_id))], (ids, from, to) => supabase.from("project_sites").select("id,name").in("id", ids).order("id").range(from, to), "employee site names"),
    readByIds(attendanceResult.data.map(row => row.id), (ids, from, to) => supabase.from("project_attendance_reversals").select("attendance_id,reason").in("attendance_id", ids).order("attendance_id").range(from, to), "employee attendance corrections"),
  ]);
  const actorIds = [...new Set([
    ...(assignments ?? []).flatMap((item) => [item.assigned_by, item.ended_by].filter((value): value is string => Boolean(value))),
    ...eventRows.map((item) => item.actor_id),
    ...rateRows.map((item) => item.approved_by),
  ])];
  const actors = await readByIds(actorIds, (ids, from, to) => supabase.from("profiles").select("id,full_name").in("id", ids).order("id").range(from, to), "workforce actors");
  const actorMap = new Map(actors.map((item) => [item.id, item.full_name]));
  const projectMap = new Map(projects.map((item) => [item.id, item.name]));
  const siteMap = new Map(sites.map((item) => [item.id, item.name]));
  const linkedProfile = linkedProfileResult.data ?? undefined;
  const reversedAttendance = new Map(attendanceReversals.map(row => [row.attendance_id, row.reason]));
  return {
    employee: { ...employee, fullName: employeeFullName(employee) },
    category: categoryResult.data as EmployeeCategoryRow,
    contact: contactResult.data ?? null,
    linkedProfile,
    assignments: assignments.map((assignment): WorkforceAssignmentView => ({
      ...assignment,
      projectName: projectMap.get(assignment.project_id) ?? "Unavailable project",
      siteName: siteMap.get(assignment.project_site_id) ?? "Unavailable site",
      assignedByName: actorMap.get(assignment.assigned_by) ?? "Authorized user",
    })),
    rates: rateRows.map((rate) => ({ ...rate, approvedByName: actorMap.get(rate.approved_by) ?? "Authorized user" })),
    events: eventRows.map((event) => ({ ...event, actorName: actorMap.get(event.actor_id) ?? "Authorized user" })),
    attendance: attendanceResult.data.map(row => ({ ...row, projectName: projectMap.get(row.project_id) ?? "Unavailable project", reversal: reversedAttendance.get(row.id) })),
    history: { assignments: { count: assignmentResult.count, page: assignmentResult.page }, rates: { count: rateResult.count, page: rateResult.page }, events: { count: eventResult.count, page: eventResult.page }, attendance: { count: attendanceResult.count, page: attendanceResult.page } },
    references: { categories, profiles: linkedProfile ? [linkedProfile] : [] },
  };
}

export async function getProjectWorkforce(projectId: string, canViewRates: boolean) {
  const supabase = await createClient();
  const [assignments, sites] = await Promise.all([
    readAllPages((from, to) => supabase.from("employee_project_assignments").select("*").eq("project_id", projectId).order("start_date", { ascending: false }).order("id").range(from, to), "project workforce"),
    readAllPages((from, to) => supabase.from("project_sites").select("*").eq("project_id", projectId).eq("status", "active").order("name").order("id").range(from, to), "project sites"),
  ]);
  const employeeIds = [...new Set(assignments.map((item) => item.employee_id))];
  const [assignedEmployees, categories] = await Promise.all([
    readByIds(employeeIds, (ids, from, to) => supabase.from("employees").select("*").in("id", ids).order("id").range(from, to), "assigned employees"),
    getEmployeeCategories(false),
  ]);
  const ratesResult: LaborRateRow[] = canViewRates
    ? await readByIds(employeeIds, (ids, from, to) => supabase.from("labor_rates").select("*").in("employee_id", ids).lte("effective_start_date", new Date().toISOString().slice(0, 10)).order("effective_start_date", { ascending: false }).order("id").range(from, to), "authorized labor rates")
    : [];
  const employeeMap = new Map(assignedEmployees.map((employee) => [employee.id, employee]));
  const categoryMap = new Map(categories.map((category) => [category.id, category.name]));
  const siteMap = new Map(sites.map((site) => [site.id, site.name]));
  const today = new Date().toISOString().slice(0, 10);
  const ratesByEmployee = new Map<string, LaborRateRow[]>();
  for (const rate of ratesResult) {
    if (rate.effective_end_date && rate.effective_end_date < today) continue;
    ratesByEmployee.set(rate.employee_id, [...(ratesByEmployee.get(rate.employee_id) ?? []), rate]);
  }
  return {
    assignments: assignments.map((assignment) => {
      const employee = employeeMap.get(assignment.employee_id);
      return {
        ...assignment,
        employee,
        employeeName: employee ? employeeFullName(employee) : "Unavailable employee",
        categoryName: employee ? categoryMap.get(employee.category_id) ?? "Unavailable category" : "Unavailable category",
        siteName: siteMap.get(assignment.project_site_id) ?? "Unavailable site",
        currentRates: ratesByEmployee.get(assignment.employee_id) ?? [],
      };
    }),
    sites,
  };
}

export async function getProjectWorkerCount(projectId: string) {
  const supabase = await createClient();
  const rows = await readAllPages((from, to) => supabase.from("employee_project_assignments")
    .select("employee_id,id").eq("project_id", projectId).eq("status", "active").order("id").range(from, to), "project worker count");
  return new Set(rows.map((row) => row.employee_id)).size;
}

export type EmployeeCategory = EmployeeCategoryRow;
export type EmployeeRate = LaborRateRow;
