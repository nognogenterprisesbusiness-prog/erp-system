import "server-only";
import { notFound } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { safeSearchTerm } from "./search";
import type { ProjectStatus } from "@/types/database";

const PAGE_SIZE = 20;
export type ProjectListParams = { query?: string; status?: ProjectStatus | "all"; sort?: "newest" | "name" | "target" | "code" | "budget" | "client" | "status"; direction?: "asc" | "desc"; page?: number };

export async function getProjects(params: ProjectListParams = {}) {
  const supabase = await createClient();
  const page = Math.max(1, params.page ?? 1);
  const from = (page - 1) * PAGE_SIZE;
  let query = supabase.from("projects").select("id,code,name,photo_path,client_name,city_province,start_date,target_completion_date,status,initial_budget,created_at", { count: "exact" }).is("archived_at", null);
  const search = safeSearchTerm(params.query);
  if (search) query = query.or(`name.ilike.%${search}%,code.ilike.%${search}%,client_name.ilike.%${search}%`);
  if (params.status && params.status !== "all") query = query.eq("status", params.status);
  const ascending = params.direction === "asc";
  if (params.sort === "name") query = query.order("name", { ascending });
  else if (params.sort === "target") query = query.order("target_completion_date", { ascending });
  else if (params.sort === "code") query = query.order("code", { ascending });
  else if (params.sort === "budget") query = query.order("initial_budget", { ascending });
  else if (params.sort === "client") query = query.order("client_name", { ascending });
  else if (params.sort === "status") query = query.order("status", { ascending });
  else query = query.order("created_at", { ascending });
  const { data, count, error } = await query.range(from, from + PAGE_SIZE - 1);
  if (error) throw new Error(`Unable to load projects: ${error.message}`);
  const projects = data ?? [];
  const ids = projects.map((project) => project.id);
  const { data: assignments, error: assignmentError } = ids.length
    ? await supabase.from("project_assignments").select("project_id,user_id").in("project_id", ids).eq("status", "active")
    : { data: [], error: null };
  if (assignmentError) throw new Error(`Unable to load project personnel: ${assignmentError.message}`);
  const userIds = [...new Set((assignments ?? []).map((assignment) => assignment.user_id))];
  const { data: profiles, error: profileError } = userIds.length
    ? await supabase.from("profiles").select("id,full_name,email,phone,is_active,onboarding_required,created_at,updated_at").in("id", userIds)
    : { data: [], error: null };
  if (profileError) throw new Error(`Unable to load project personnel: ${profileError.message}`);
  const names = new Map((profiles ?? []).map((profile) => [profile.id, profile.full_name]));
  const personnel = new Map<string, string[]>();
  for (const assignment of assignments ?? []) personnel.set(assignment.project_id, [...(personnel.get(assignment.project_id) ?? []), names.get(assignment.user_id) ?? "Unavailable profile"]);
  return { projects: projects.map((project) => ({ ...project, assignedPersonnel: personnel.get(project.id) ?? [] })), count: count ?? 0, page, pageCount: Math.max(1, Math.ceil((count ?? 0) / PAGE_SIZE)) };
}

export async function getProject(id: string) {
  const supabase = await createClient();
  const { data: project, error } = await supabase.from("projects").select("*").eq("id", id).is("archived_at", null).single();
  if (error || !project) notFound();
  const [{ data: assignments }, { data: sites }, { data: profiles }] = await Promise.all([
    supabase.from("project_assignments").select("*").eq("project_id", id).order("assigned_on", { ascending: false }),
    supabase.from("project_sites").select("*").eq("project_id", id).order("name"),
    supabase.from("profiles").select("id,full_name,email,phone,is_active,onboarding_required,created_at,updated_at").eq("is_active", true).order("full_name"),
  ]);
  const profileMap = new Map((profiles ?? []).map((profile) => [profile.id, profile]));
  return { project, assignments: (assignments ?? []).map((assignment) => ({ ...assignment, profile: profileMap.get(assignment.user_id) })), sites: sites ?? [], profiles: profiles ?? [] };
}

export async function getAssignableProfiles() {
  const supabase = await createClient();
  const { data, error } = await supabase.from("profiles").select("id,full_name,email,phone,is_active,onboarding_required,created_at,updated_at").eq("is_active", true).order("full_name");
  if (error) throw new Error(`Unable to load personnel: ${error.message}`);
  return data ?? [];
}
