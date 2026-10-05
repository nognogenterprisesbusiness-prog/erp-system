"use server";
import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { projectInputSchema, projectSiteInputSchema, projectUpdateSchema, uuidSchema } from "@nognog/domain";
import type { ActionResult } from "@nognog/domain";
import { requireManager } from "@/lib/auth";
import { prepareRecordPhoto, saveRecordPhoto } from "@/lib/media/record-photo";
import { createClient } from "@/lib/supabase/server";

export type ProjectActionState = ActionResult<{ id: string }> | { ok: false; message: string; fieldErrors?: Record<string, string[]>; savedId: string };
const initialError = (message: string): ProjectActionState => ({ ok: false, message });
const value = (form: FormData, key: string) => String(form.get(key) ?? "");
function projectPayload(form: FormData) { return { code: value(form, "code").toUpperCase(), name: value(form, "name"), description: value(form, "description"), clientName: value(form, "clientName"), clientEmail: value(form, "clientEmail"), clientPhone: value(form, "clientPhone"), address: value(form, "address"), municipalityCode: value(form, "municipalityCode"), startDate: value(form, "startDate"), targetCompletionDate: value(form, "targetCompletionDate"), actualCompletionDate: value(form, "actualCompletionDate"), contractAmount: value(form, "contractAmount"), status: value(form, "status"), projectManagerId: value(form, "projectManagerId") }; }

export async function saveProjectAction(previous: ProjectActionState, form: FormData): Promise<ProjectActionState> {
  let actor;
  try { actor = await requireManager(); } catch (error) { return initialError(error instanceof Error ? error.message : "Not authorized."); }
  // A failed photo upload must remain retryable without inserting the project twice.
  const savedId = !previous.ok && "savedId" in previous ? previous.savedId : undefined;
  const id = value(form, "id") || savedId || "";
  const failed = (message: string, fieldErrors?: Record<string, string[]>): ProjectActionState => ({ ok: false, message, ...(fieldErrors ? { fieldErrors } : {}), ...(savedId ? { savedId } : {}) });
  const parsed = id ? projectUpdateSchema.safeParse({ ...projectPayload(form), id }) : projectInputSchema.safeParse(projectPayload(form));
  if (!parsed.success) return failed("Review the highlighted fields.", parsed.error.flatten().fieldErrors);
  const submittedPhoto = form.get("photo");
  if (form.get("photoSelected") === "1" && (!(submittedPhoto instanceof File) || submittedPhoto.size === 0)) {
    const message = "The selected project photo was not included in the submission. Please choose it again.";
    return failed(message, { photo: [message] });
  }
  let photo: Buffer | undefined;
  try { photo = await prepareRecordPhoto(submittedPhoto); } catch (error) {
    const message = error instanceof Error ? error.message : "Invalid photo.";
    return failed(message, { photo: [message] });
  }
  const input = parsed.data;
  const supabase = await createClient();
  if (input.projectManagerId) {
    const { data: engineerRole, error: engineerError } = await supabase.from("user_roles").select("user_id").eq("user_id", input.projectManagerId).eq("role", "engineer").maybeSingle();
    if (engineerError || !engineerRole) return failed("Choose an engineer for the project lead.", { projectManagerId: ["Choose an active engineer."] });
  }
  const { data: municipality, error: locationError } = await supabase.from("geo_municipalities").select("code,display_name,province_name").eq("code", input.municipalityCode).eq("selectable", true).single();
  if (locationError || !municipality) return failed("Choose a valid city or municipality.", { municipalityCode: ["Choose a city or municipality from the list."] });
  const row = { code: input.code, name: input.name, description: input.description || null, client_name: input.clientName, client_email: input.clientEmail || null, client_phone: input.clientPhone || null, address: input.address, city_province: `${municipality.display_name}, ${municipality.province_name}`, municipality_code: municipality.code, start_date: input.startDate, target_completion_date: input.targetCompletionDate, actual_completion_date: input.actualCompletionDate || null, contract_amount: Number(input.contractAmount), status: input.status, project_manager_id: input.projectManagerId || null, updated_by: actor.userId };
  const result = id ? await supabase.from("projects").update(row).eq("id", id).select("id").single() : await supabase.from("projects").insert({ ...row, initial_budget: 0, created_by: actor.userId }).select("id").single();
  if (result.error) return failed(result.error.code === "23505" ? "That project code is already in use." : `Unable to save project: ${result.error.message}`);
  if (photo) {
    try { await saveRecordPhoto("projects", result.data.id, photo); }
    catch (error) {
      const reason = error instanceof Error ? error.message : "Photo storage failed.";
      const message = `The project was saved, but its photo was not. ${reason} Retry Save to upload the same photo.`;
      return { ok: false, savedId: result.data.id, message, fieldErrors: { photo: [message] } };
    }
  }
  // These authenticated routes are dynamic; the client refreshes only its current page.
  return { ok: true, data: { id: result.data.id } };
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

// A site only needs its Engineer and Foreman; it takes the project's name and
// address. Additional sites are numbered: "Compostela Gym 2", "Compostela Gym 3".
export async function createProjectSiteAction(form: FormData) {
  const actor = await requireManager();
  const projectId = value(form, "projectId");
  if (!uuidSchema.safeParse(projectId).success) throw new Error("Review the site details and try again.");
  const supabase = await createClient();
  const [{ data: project }, { data: existing }] = await Promise.all([
    supabase.from("projects").select("name,address").eq("id", projectId).maybeSingle(),
    supabase.from("project_sites").select("name").eq("project_id", projectId),
  ]);
  if (!project) throw new Error("The project could not be found.");
  const taken = new Set((existing ?? []).map((site) => site.name.trim().toLowerCase()));
  let name = project.name.trim();
  for (let number = 2; taken.has(name.toLowerCase()); number++) name = `${project.name.trim().slice(0, 150)} ${number}`;
  const parsed = projectSiteInputSchema.safeParse({ projectId, name, address: project.address, description: "", engineerId: value(form, "engineerId"), foremanId: value(form, "foremanId"), status: "active" });
  if (!parsed.success) throw new Error("Review the site details and try again.");
  const { error } = await supabase.from("project_sites").insert({ project_id: parsed.data.projectId, name: parsed.data.name, address: parsed.data.address, description: parsed.data.description || null, engineer_id: parsed.data.engineerId || null, foreman_id: parsed.data.foremanId || null, status: parsed.data.status, created_by: actor.userId, updated_by: actor.userId });
  if (error) throw new Error(`Unable to create site: ${error.message}`);
  revalidatePath(`/projects/${parsed.data.projectId}`); revalidatePath(`/projects/${parsed.data.projectId}/workforce`);
}

// Change who runs a site. The database checks that each person has the
// matching Engineer or Foreman role.
export async function updateProjectSiteStaffAction(form: FormData) {
  const actor = await requireManager();
  const siteId = value(form, "siteId");
  const projectId = value(form, "projectId");
  const engineerId = value(form, "engineerId");
  const foremanId = value(form, "foremanId");
  if (![siteId, projectId].every((id) => uuidSchema.safeParse(id).success)
    || ![engineerId, foremanId].every((id) => id === "" || uuidSchema.safeParse(id).success)) throw new Error("Review the site staff and try again.");
  const supabase = await createClient();
  const { error } = await supabase.from("project_sites").update({ engineer_id: engineerId || null, foreman_id: foremanId || null, updated_by: actor.userId }).eq("id", siteId).eq("project_id", projectId);
  if (error) throw new Error(`Unable to update site staff: ${error.message}`);
  revalidatePath(`/projects/${projectId}`); revalidatePath(`/projects/${projectId}/workforce`);
}
