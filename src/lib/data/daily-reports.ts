import "server-only";
import { notFound } from "next/navigation";
import { uuidSchema } from "@nognog/domain";
import { z } from "zod";
import { requireDailyReportViewer } from "@/lib/auth";
import { createClient } from "@/lib/supabase/server";
import { safeSearchTerm } from "./search";
import { readAllPages, readByIds } from "./read-all-pages";
import type { DailyReportStatus } from "@/types/database";

const PAGE_SIZE = 20;
const reportingRoles = ["engineer", "foreman"] as const;

export async function getDailyReportChoices() {
  const user = await requireDailyReportViewer();
  const supabase = await createClient();
  const [assignments, assignedSites] = user.canManage ? [[], []] : await Promise.all([readAllPages((from, to) => supabase.from("project_assignments")
    .select("project_id,assignment_role").eq("user_id", user.userId).eq("status", "active")
    .in("assignment_role", [...reportingRoles]).order("project_id").order("assignment_role").range(from, to), "report project assignments"),
    readAllPages((from, to) => supabase.from("project_sites")
      .select("project_id").eq("status", "active")
      .or(`engineer_id.eq.${user.userId},foreman_id.eq.${user.userId}`)
      .order("project_id").order("id").range(from, to), "assigned report sites")]);
  const allowedIds = user.canManage ? null : [...new Set([
    ...assignments.filter((item) => user.roles.includes(item.assignment_role)).map((item) => item.project_id),
    ...assignedSites.map((item) => item.project_id),
  ])];
  if (allowedIds && allowedIds.length === 0) return { projects: [], sites: [] };
  const projects = allowedIds
    ? await readByIds(allowedIds, (ids, from, to) => supabase.from("projects").select("id,code,name,status,start_date,target_completion_date").in("id", ids).is("archived_at", null).in("status", ["active", "on_hold"]).order("name").order("id").range(from, to), "available report projects")
    : await readAllPages((from, to) => supabase.from("projects").select("id,code,name,status,start_date,target_completion_date").is("archived_at", null).in("status", ["active", "on_hold"]).order("name").order("id").range(from, to), "available report projects");
  const ids = projects.map((project) => project.id);
  if (!ids.length) return { projects: [], sites: [] };
  const sites = await readByIds(ids, (batch, from, to) => supabase.from("project_sites")
    .select("id,project_id,name,status").in("project_id", batch).eq("status", "active").order("name").order("id").range(from, to), "report project sites");
  return { projects, sites };
}

export async function getDailyReportFilterChoices() {
  await requireDailyReportViewer();
  const supabase = await createClient();
  const projects = await readAllPages((from, to) => supabase.from("projects")
    .select("id,code,name").order("name").order("id").range(from, to), "report project filters");
  const ids = projects.map((project) => project.id);
  if (!ids.length) return { projects: [], sites: [] };
  const sites = await readByIds(ids, (batch, from, to) => supabase.from("project_sites")
    .select("id,project_id,name").in("project_id", batch).order("name").order("id").range(from, to), "report site filters");
  return { projects, sites };
}

export type DailyReportFilters = {
  search?: string;
  projectId?: string;
  siteId?: string;
  reportDateFrom?: string;
  reportDateTo?: string;
  status?: DailyReportStatus | "all";
  page?: number;
};

export async function getDailyReports(filters: DailyReportFilters = {}) {
  await requireDailyReportViewer();
  const supabase = await createClient();
  const page = Math.min(10_000, Math.max(1, Number.isSafeInteger(filters.page) ? filters.page! : 1));
  let query = supabase.from("daily_reports").select("*", { count: "exact" });
  const search = safeSearchTerm(filters.search);
  if (search) query = query.or(`report_number.ilike.%${search}%,work_description.ilike.%${search}%`);
  if (filters.projectId && uuidSchema.safeParse(filters.projectId).success) query = query.eq("project_id", filters.projectId);
  if (filters.siteId && uuidSchema.safeParse(filters.siteId).success) query = query.eq("project_site_id", filters.siteId);
  if (filters.reportDateFrom && z.iso.date().safeParse(filters.reportDateFrom).success) query = query.gte("report_date", filters.reportDateFrom);
  if (filters.reportDateTo && z.iso.date().safeParse(filters.reportDateTo).success) query = query.lte("report_date", filters.reportDateTo);
  if (filters.status && filters.status !== "all") query = query.eq("status", filters.status);
  const { data, count, error } = await query.order("report_date", { ascending: false }).order("created_at", { ascending: false }).order("id")
    .range((page - 1) * PAGE_SIZE, page * PAGE_SIZE - 1);
  if (error) throw new Error("Unable to load daily reports.");
  const rows = data ?? [];
  const projectIds = [...new Set(rows.map((row) => row.project_id))];
  const siteIds = [...new Set(rows.map((row) => row.project_site_id))];
  const actorIds = [...new Set(rows.map((row) => row.prepared_by))];
  const [projects, sites, actors] = await Promise.all([
    projectIds.length ? supabase.from("projects").select("id,code,name").in("id", projectIds) : Promise.resolve({ data: [], error: null }),
    siteIds.length ? supabase.from("project_sites").select("id,name").in("id", siteIds) : Promise.resolve({ data: [], error: null }),
    actorIds.length ? supabase.from("profiles").select("id,full_name").in("id", actorIds) : Promise.resolve({ data: [], error: null }),
  ]);
  if (projects.error || sites.error || actors.error) throw new Error("Unable to resolve daily report references.");
  const projectMap = new Map((projects.data ?? []).map((item) => [item.id, item]));
  const siteMap = new Map((sites.data ?? []).map((item) => [item.id, item.name]));
  const actorMap = new Map((actors.data ?? []).map((item) => [item.id, item.full_name]));
  return {
    reports: rows.map((row) => ({ ...row, project: projectMap.get(row.project_id), siteName: siteMap.get(row.project_site_id) ?? "Unavailable site", preparerName: actorMap.get(row.prepared_by) ?? "Authorized reporter" })),
    count: count ?? 0,
    page,
    pageCount: Math.max(1, Math.ceil((count ?? 0) / PAGE_SIZE)),
  };
}

export async function getDailyReport(id: string) {
  await requireDailyReportViewer();
  if (!uuidSchema.safeParse(id).success) notFound();
  const supabase = await createClient();
  const { data: report, error } = await supabase.from("daily_reports").select("*").eq("id", id).maybeSingle();
  if (error) throw new Error(`Unable to load daily report: ${error.message}`, { cause: error });
  if (!report) notFound();
  const [project, site, events, preparer] = await Promise.all([
    supabase.from("projects").select("id,code,name,address,city_province").eq("id", report.project_id).single(),
    supabase.from("project_sites").select("id,project_id,name,address,status").eq("id", report.project_site_id).single(),
    readAllPages((from, to) => supabase.from("daily_report_events").select("*").eq("report_id", id).order("occurred_at", { ascending: false }).order("id").range(from, to), "daily report events"),
    supabase.from("profiles").select("id,full_name").eq("id", report.prepared_by).single(),
  ]);
  if (project.error || site.error) throw new Error("Unable to load daily report details.");
  const actorIds = [...new Set(events.map((item) => item.actor_id))];
  const actors = await readByIds(actorIds, (ids, from, to) => supabase.from("profiles").select("id,full_name").in("id", ids).order("id").range(from, to), "report history actors");
  const names = new Map(actors.map((actor) => [actor.id, actor.full_name]));
  return { report, project: project.data!, site: site.data!, preparerName: preparer.data?.full_name ?? "Authorized reporter",
    events: events.map((event) => ({ ...event, actorName: names.get(event.actor_id) ?? "Authorized reporter" })) };
}
