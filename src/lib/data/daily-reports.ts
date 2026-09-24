import "server-only";
import { notFound } from "next/navigation";
import { uuidSchema } from "@nognog/domain";
import { z } from "zod";
import { requireDailyReportViewer } from "@/lib/auth";
import { createClient } from "@/lib/supabase/server";
import { safeSearchTerm } from "./search";
import type { DailyReportStatus } from "@/types/database";

const PAGE_SIZE = 20;
const reportingRoles = ["project_manager", "engineer", "foreman"] as const;

export async function getDailyReportChoices() {
  const user = await requireDailyReportViewer();
  const supabase = await createClient();
  const assignments = user.canManage ? null : await supabase.from("project_assignments")
    .select("project_id,assignment_role").eq("user_id", user.userId).eq("status", "active")
    .in("assignment_role", [...reportingRoles]).limit(1000);
  if (assignments?.error) throw new Error("Unable to load your project assignments.");
  const allowedIds = user.canManage ? null : [...new Set((assignments?.data ?? [])
    .filter((item) => user.roles.includes(item.assignment_role))
    .map((item) => item.project_id))];
  if (allowedIds && allowedIds.length === 0) return { projects: [], sites: [] };
  let projectQuery = supabase.from("projects")
    .select("id,code,name,status,start_date,target_completion_date")
    .is("archived_at", null).in("status", ["active", "on_hold"]).order("name").limit(1000);
  if (allowedIds) projectQuery = projectQuery.in("id", allowedIds);
  const { data: projects, error } = await projectQuery;
  if (error) throw new Error("Unable to load available projects.");
  const ids = (projects ?? []).map((project) => project.id);
  if (!ids.length) return { projects: [], sites: [] };
  const { data: sites, error: siteError } = await supabase.from("project_sites")
    .select("id,project_id,name,status").in("project_id", ids).eq("status", "active").order("name").limit(2000);
  if (siteError) throw new Error("Unable to load project sites.");
  return { projects: projects ?? [], sites: sites ?? [] };
}

export async function getDailyReportFilterChoices() {
  await requireDailyReportViewer();
  const supabase = await createClient();
  const { data: projects, error } = await supabase.from("projects")
    .select("id,code,name").order("name").limit(1000);
  if (error) throw new Error("Unable to load report project filters.");
  const ids = (projects ?? []).map((project) => project.id);
  if (!ids.length) return { projects: [], sites: [] };
  const { data: sites, error: siteError } = await supabase.from("project_sites")
    .select("id,project_id,name").in("project_id", ids).order("name").limit(2000);
  if (siteError) throw new Error("Unable to load report site filters.");
  return { projects: projects ?? [], sites: sites ?? [] };
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
  const { data, count, error } = await query.order("report_date", { ascending: false }).order("created_at", { ascending: false })
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
  const { data: report, error } = await supabase.from("daily_reports").select("*").eq("id", id).single();
  if (error || !report) notFound();
  const [project, site, events, preparer] = await Promise.all([
    supabase.from("projects").select("id,code,name,address,city_province").eq("id", report.project_id).single(),
    supabase.from("project_sites").select("id,project_id,name,address,status").eq("id", report.project_site_id).single(),
    supabase.from("daily_report_events").select("*").eq("report_id", id).order("occurred_at", { ascending: false }).limit(200),
    supabase.from("profiles").select("id,full_name").eq("id", report.prepared_by).single(),
  ]);
  if (project.error || site.error || events.error) throw new Error("Unable to load daily report details.");
  const actorIds = [...new Set((events.data ?? []).map((item) => item.actor_id))];
  const { data: actors, error: actorsError } = actorIds.length
    ? await supabase.from("profiles").select("id,full_name").in("id", actorIds)
    : { data: [], error: null };
  if (actorsError) throw new Error("Unable to load report history.");
  const names = new Map((actors ?? []).map((actor) => [actor.id, actor.full_name]));
  return { report, project: project.data!, site: site.data!, preparerName: preparer.data?.full_name ?? "Authorized reporter",
    events: (events.data ?? []).map((event) => ({ ...event, actorName: names.get(event.actor_id) ?? "Authorized reporter" })) };
}
