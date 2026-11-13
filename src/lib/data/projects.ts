import "server-only";
import { notFound } from "next/navigation";
import { uuidSchema } from "@nognog/domain";
import { createClient } from "@/lib/supabase/server";
import { readAllPages, readByIds } from "./read-all-pages";
import { safeSearchTerm } from "./search";
import type { AppRole, ProjectStatus } from "@/types/database";

const PAGE_SIZE = 20;
export type ProjectListParams = { query?: string; status?: ProjectStatus | "all"; sort?: "newest" | "name" | "target" | "code" | "client" | "status"; direction?: "asc" | "desc"; page?: number; includeProgress?: boolean };

export async function getProjects(params: ProjectListParams = {}) {
  const supabase = await createClient();
  const page = Math.max(1, params.page ?? 1);
  const from = (page - 1) * PAGE_SIZE;
  let query = supabase.from("projects").select("id,code,name,photo_path,client_name,city_province,start_date,target_completion_date,status,created_at,updated_at", { count: "exact" }).is("archived_at", null);
  const search = safeSearchTerm(params.query);
  if (search) query = query.or(`name.ilike.%${search}%,code.ilike.%${search}%,client_name.ilike.%${search}%`);
  if (params.status && params.status !== "all") query = query.eq("status", params.status);
  const ascending = params.direction === "asc";
  if (params.sort === "name") query = query.order("name", { ascending });
  else if (params.sort === "target") query = query.order("target_completion_date", { ascending });
  else if (params.sort === "code") query = query.order("code", { ascending });
  else if (params.sort === "client") query = query.order("client_name", { ascending });
  else if (params.sort === "status") query = query.order("status", { ascending });
  else query = query.order("created_at", { ascending });
  const { data, count, error } = await query.order("id").range(from, from + PAGE_SIZE - 1);
  if (error) throw new Error(`Unable to load projects: ${error.message}`);
  const projects = data ?? [];
  const ids = projects.map((project) => project.id);
  const [progress, assignments] = await Promise.all([
    params.includeProgress ? readByIds(ids, (batch, from, to) => supabase.from("project_progress_entries").select("id,project_id,completion_percent,progress_date,recorded_at").in("project_id", batch).order("progress_date", { ascending: false }).order("recorded_at", { ascending: false }).order("id").range(from, to), "project progress") : [],
    readByIds(ids, (batch, from, to) => supabase.from("project_assignments").select("id,project_id,user_id").in("project_id", batch).eq("status", "active").order("id").range(from, to), "project personnel"),
  ]);
  const latestProgress = new Map<string, number>();
  for (const entry of progress) if (!latestProgress.has(entry.project_id)) latestProgress.set(entry.project_id, Number(entry.completion_percent));
  const userIds = [...new Set(assignments.map(assignment => assignment.user_id))];
  const profiles = await readByIds(userIds, (batch, from, to) => supabase.from("profiles").select("id,full_name").in("id", batch).order("id").range(from, to), "project personnel names");
  const names = new Map((profiles ?? []).map((profile) => [profile.id, profile.full_name]));
  const personnel = new Map<string, string[]>();
  for (const assignment of assignments ?? []) personnel.set(assignment.project_id, [...(personnel.get(assignment.project_id) ?? []), names.get(assignment.user_id) ?? "Unavailable profile"]);
  return { projects: projects.map((project) => ({ ...project, progress: latestProgress.get(project.id), assignedPersonnel: personnel.get(project.id) ?? [] })), count: count ?? 0, page, pageCount: Math.max(1, Math.ceil((count ?? 0) / PAGE_SIZE)) };
}

export async function getProject(id: string) {
  if (!uuidSchema.safeParse(id).success) notFound();
  const supabase = await createClient();
  const { data: project, error } = await supabase.from("projects").select("*").eq("id", id).is("archived_at", null).maybeSingle();
  if (error) throw new Error(`Unable to load project: ${error.message}`, { cause: error });
  if (!project) notFound();
  const [assignments, sites, roleRows] = await Promise.all([
    readAllPages((from, to) => supabase.from("project_assignments").select("*").eq("project_id", id).order("assigned_on", { ascending: false }).order("id").range(from, to), "project assignments"),
    readAllPages((from, to) => supabase.from("project_sites").select("*").eq("project_id", id).order("name").order("id").range(from, to), "project sites"),
    readAllPages((from, to) => supabase.from("user_roles").select("user_id,role").in("role", ["engineer", "foreman"]).order("user_id").order("role").range(from, to), "project role choices"),
  ]);
  const profileIds = [...new Set([...assignments.map(row => row.user_id), ...sites.flatMap(row => [row.engineer_id, row.foreman_id].filter((id): id is string => Boolean(id))), ...roleRows.map(row => row.user_id)])];
  const profiles = await readByIds(profileIds, (ids, from, to) => supabase.from("profiles").select("id,full_name,email,phone,is_active,onboarding_required,created_at,updated_at").in("id", ids).order("full_name").order("id").range(from, to), "project personnel");
  profiles.sort((a,b) => a.full_name.localeCompare(b.full_name) || a.id.localeCompare(b.id));
  const profileMap = new Map((profiles ?? []).map((profile) => [profile.id, profile]));
  const eligible = (role: "engineer" | "foreman") => {
    const ids = new Set((roleRows ?? []).filter((row) => row.role === role).map((row) => row.user_id));
    return profiles.filter(profile => profile.is_active && ids.has(profile.id));
  };
  return { project, assignments: (assignments ?? []).map((assignment) => ({ ...assignment, profile: profileMap.get(assignment.user_id) })), sites: sites ?? [], profiles: profiles ?? [], engineers: eligible("engineer"), foremen: eligible("foreman") };
}

export async function getAssignableProfiles(role?: AppRole) {
  const supabase = await createClient();
  if (role) {
    const roles = await readAllPages((from, to) => supabase.from("user_roles").select("user_id").eq("role", role).order("user_id").range(from, to), "assignable account roles");
    const profiles = await readByIds(roles.map(row => row.user_id), (ids, from, to) => supabase.from("profiles").select("id,full_name,email,phone,is_active,onboarding_required,created_at,updated_at").in("id", ids).eq("is_active", true).order("full_name").order("id").range(from, to), "assignable accounts");
    return profiles.sort((a,b) => a.full_name.localeCompare(b.full_name) || a.id.localeCompare(b.id));
  }
  return readAllPages((from, to) => supabase.from("profiles").select("id,full_name,email,phone,is_active,onboarding_required,created_at,updated_at").eq("is_active", true).order("full_name").order("id").range(from, to), "assignable accounts");
}
