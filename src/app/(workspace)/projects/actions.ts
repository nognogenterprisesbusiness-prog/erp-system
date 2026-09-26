"use server";
import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { projectAssignmentInputSchema, projectInputSchema, projectSiteInputSchema, projectUpdateSchema } from "@nognog/domain";
import type { ActionResult } from "@nognog/domain";
import { requireManager } from "@/lib/auth";
import { prepareRecordPhoto, saveRecordPhoto } from "@/lib/media/record-photo";
import { createClient } from "@/lib/supabase/server";

export type ProjectActionState = ActionResult<{ id: string }> | { ok: true; data: { id: string }; message: string };
const initialError = (message: string): ProjectActionState => ({ ok: false, message });
const value = (form: FormData, key: string) => String(form.get(key) ?? "");
function projectPayload(form: FormData) { return { code: value(form, "code").toUpperCase(), name: value(form, "name"), description: value(form, "description"), clientName: value(form, "clientName"), clientEmail: value(form, "clientEmail"), clientPhone: value(form, "clientPhone"), address: value(form, "address"), municipalityCode: value(form, "municipalityCode"), startDate: value(form, "startDate"), targetCompletionDate: value(form, "targetCompletionDate"), actualCompletionDate: value(form, "actualCompletionDate"), contractAmount: value(form, "contractAmount"), initialBudget: value(form, "initialBudget"), status: value(form, "status"), projectManagerId: value(form, "projectManagerId") }; }

export async function saveProjectAction(_: ProjectActionState, form: FormData): Promise<ProjectActionState> {
  let actor;
  try { actor = await requireManager(); } catch (error) { return initialError(error instanceof Error ? error.message : "Not authorized."); }
  const id = value(form, "id");
  const parsed = id ? projectUpdateSchema.safeParse({ ...projectPayload(form), id }) : projectInputSchema.safeParse(projectPayload(form));
  if (!parsed.success) return { ok: false, message: "Review the highlighted fields.", fieldErrors: parsed.error.flatten().fieldErrors };
  let photo: Buffer | undefined;
  try { photo = await prepareRecordPhoto(form.get("photo")); } catch (error) { return initialError(error instanceof Error ? error.message : "Invalid photo."); }
  const input = parsed.data;
  const supabase = await createClient();
  if (input.projectManagerId) {
    const { data: engineerRole, error: engineerError } = await supabase.from("user_roles").select("user_id").eq("user_id", input.projectManagerId).eq("role", "engineer").maybeSingle();
    if (engineerError || !engineerRole) return { ok: false, message: "Choose an engineer for the project lead.", fieldErrors: { projectManagerId: ["Choose an active engineer."] } };
  }
  const { data: municipality, error: locationError } = await supabase.from("geo_municipalities").select("code,display_name,province_name").eq("code", input.municipalityCode).eq("selectable", true).single();
  if (locationError || !municipality) return { ok: false, message: "Choose a valid city or municipality.", fieldErrors: { municipalityCode: ["Choose a city or municipality from the list."] } };
  const row = { code: input.code, name: input.name, description: input.description || null, client_name: input.clientName, client_email: input.clientEmail || null, client_phone: input.clientPhone || null, address: input.address, city_province: `${municipality.display_name}, ${municipality.province_name}`, municipality_code: municipality.code, start_date: input.startDate, target_completion_date: input.targetCompletionDate, actual_completion_date: input.actualCompletionDate || null, contract_amount: Number(input.contractAmount), initial_budget: Number(input.initialBudget), status: input.status, project_manager_id: input.projectManagerId || null, updated_by: actor.userId };
  const result = id ? await supabase.from("projects").update(row).eq("id", id).select("id").single() : await supabase.from("projects").insert({ ...row, created_by: actor.userId }).select("id").single();
  if (result.error) return initialError(result.error.code === "23505" ? "That project code is already in use." : `Unable to save project: ${result.error.message}`);
  if (photo) {
    try { await saveRecordPhoto("projects", result.data.id, photo); }
    catch (error) { revalidatePath("/projects"); return { ok: true, data: { id: result.data.id }, message: error instanceof Error ? error.message : "The record was saved, but its photo could not be uploaded." }; }
  }
  revalidatePath("/dashboard"); revalidatePath("/projects");
  revalidatePath(`/projects/${result.data.id}`);
  redirect(`/projects/${result.data.id}`);
}

export async function archiveProjectAction(form: FormData) {
  await requireManager();
  const id = value(form, "id");
  const supabase = await createClient();
  const { error } = await supabase.rpc("archive_project", { p_project_id: id });
  if (error) throw new Error(`Unable to archive project: ${error.message}`);
  revalidatePath("/dashboard"); revalidatePath("/projects");
  redirect("/projects");
}

export async function assignProjectMemberAction(form: FormData) {
  const actor = await requireManager();
  const parsed = projectAssignmentInputSchema.safeParse({ projectId: value(form, "projectId"), userId: value(form, "userId"), role: value(form, "role"), assignedOn: value(form, "assignedOn") });
  if (!parsed.success) throw new Error("Invalid personnel assignment.");
  const supabase = await createClient();
  const { data: matchingRole, error: roleError } = await supabase.from("user_roles").select("user_id").eq("user_id", parsed.data.userId).eq("role", parsed.data.role).maybeSingle();
  if (roleError || !matchingRole) throw new Error("The selected account does not have this project role.");
  const { error } = await supabase.from("project_assignments").insert({ project_id: parsed.data.projectId, user_id: parsed.data.userId, assignment_role: parsed.data.role, assigned_on: parsed.data.assignedOn, assigned_by: actor.userId });
  if (error) throw new Error(error.code === "23505" ? "This person already has that active role." : `Unable to assign personnel: ${error.message}`);
  revalidatePath(`/projects/${parsed.data.projectId}`);
}

export async function endProjectAssignmentAction(form: FormData) {
  const actor = await requireManager();
  const id = value(form, "assignmentId"); const projectId = value(form, "projectId");
  const supabase = await createClient();
  const { error } = await supabase.from("project_assignments").update({ status: "inactive", ended_at: new Date().toISOString(), ended_by: actor.userId }).eq("id", id);
  if (error) throw new Error(`Unable to end assignment: ${error.message}`);
  revalidatePath(`/projects/${projectId}`);
}

export async function createProjectSiteAction(form: FormData) {
  const actor = await requireManager();
  const parsed = projectSiteInputSchema.safeParse({ projectId: value(form, "projectId"), name: value(form, "name"), address: value(form, "address"), description: value(form, "description"), engineerId: value(form, "engineerId"), foremanId: value(form, "foremanId"), status: value(form, "status") });
  if (!parsed.success) throw new Error("Review the site details and try again.");
  const supabase = await createClient();
  const { error } = await supabase.from("project_sites").insert({ project_id: parsed.data.projectId, name: parsed.data.name, address: parsed.data.address, description: parsed.data.description || null, engineer_id: parsed.data.engineerId || null, foreman_id: parsed.data.foremanId || null, status: parsed.data.status, created_by: actor.userId, updated_by: actor.userId });
  if (error) throw new Error(`Unable to create site: ${error.message}`);
  revalidatePath(`/projects/${parsed.data.projectId}`);
}
