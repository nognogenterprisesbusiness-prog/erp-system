import "server-only";
import { notFound } from "next/navigation";
import { uuidSchema } from "@nognog/domain";
import { createClient } from "@/lib/supabase/server";
import { safeSearchTerm } from "./search";
import type { WarehouseStatus } from "@/types/database";

export async function getWarehouses(params: { query?: string; status?: WarehouseStatus | "all" } = {}) {
  const supabase = await createClient();
  let query = supabase.from("warehouses").select("*").order("name");
  const search = safeSearchTerm(params.query);
  if (search) query = query.or(`name.ilike.%${search}%,code.ilike.%${search}%,address.ilike.%${search}%`);
  if (params.status && params.status !== "all") query = query.eq("status", params.status);
  const { data, error } = await query;
  if (error) throw new Error(`Unable to load warehouses: ${error.message}`);
  return data ?? [];
}

export async function getWarehouse(id: string) {
  if (!uuidSchema.safeParse(id).success) notFound();
  const supabase = await createClient();
  const { data: warehouse, error } = await supabase.from("warehouses").select("*").eq("id", id).maybeSingle();
  if (error) throw new Error(`Unable to load warehouse: ${error.message}`, { cause: error });
  if (!warehouse) notFound();
  const [{ data: assignments, error: assignmentError }, { data: profiles, error: profileError }, { data: links, error: linkError }, { data: allProjects, error: allProjectError }] = await Promise.all([
    supabase.from("warehouse_assignments").select("*").eq("warehouse_id", id).order("assigned_on", { ascending: false }),
    supabase.from("profiles").select("id,full_name,email,phone,is_active,onboarding_required,created_at,updated_at").eq("is_active", true).order("full_name"),
    supabase.from("project_warehouses").select("project_id").eq("warehouse_id", id),
    supabase.from("projects").select("id,code,name").is("archived_at", null).order("name"),
  ]);
  const referenceError = assignmentError ?? profileError ?? linkError ?? allProjectError;
  if (referenceError) throw new Error(`Unable to load warehouse references: ${referenceError.message}`, { cause: referenceError });
  const projectIds = (links ?? []).map((link) => link.project_id);
  const { data: projects, error: projectError } = projectIds.length ? await supabase.from("projects").select("id,code,name").in("id", projectIds).is("archived_at", null) : { data: [], error: null };
  if (projectError) throw new Error(`Unable to load warehouse projects: ${projectError.message}`, { cause: projectError });
  const profileMap = new Map((profiles ?? []).map((profile) => [profile.id, profile]));
  return { warehouse, profiles: profiles ?? [], assignments: (assignments ?? []).map((assignment) => ({ ...assignment, profile: profileMap.get(assignment.user_id) })), projects: projects ?? [], allProjects: allProjects ?? [] };
}
