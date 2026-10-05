"use server";
import { revalidatePath } from "next/cache";
import { warehouseAssignmentInputSchema, warehouseInputSchema, warehouseUpdateSchema } from "@nognog/domain";
import type { ActionResult } from "@nognog/domain";
import { requireManager } from "@/lib/auth";
import { prepareRecordPhoto, saveRecordPhoto } from "@/lib/media/record-photo";
import { createClient } from "@/lib/supabase/server";

export type WarehouseActionState = ActionResult<{ id: string }> | { ok: true; data: { id: string }; message: string };
const value = (form: FormData, key: string) => String(form.get(key) ?? "");
const payload = (form: FormData) => ({ code: value(form, "code").toUpperCase(), name: value(form, "name"), description: value(form, "description"), address: value(form, "address"), municipalityCode: value(form, "municipalityCode"), contactPerson: value(form, "contactPerson"), contactNumber: value(form, "contactNumber"), status: value(form, "status") });

export async function saveWarehouseAction(_: WarehouseActionState, form: FormData): Promise<WarehouseActionState> {
  let actor; try { actor = await requireManager(); } catch (error) { return { ok: false, message: error instanceof Error ? error.message : "Not authorized." }; }
  const id = value(form, "id");
  const parsed = id ? warehouseUpdateSchema.safeParse({ ...payload(form), id }) : warehouseInputSchema.safeParse(payload(form));
  if (!parsed.success) return { ok: false, message: "Review the highlighted fields.", fieldErrors: parsed.error.flatten().fieldErrors };
  let photo: Buffer | undefined;
  try { photo = await prepareRecordPhoto(form.get("photo")); } catch (error) { return { ok: false, message: error instanceof Error ? error.message : "Invalid photo." }; }
  const input = parsed.data;
  const supabase = await createClient();
  const { data: municipality, error: locationError } = await supabase.from("geo_municipalities").select("code").eq("code", input.municipalityCode).eq("selectable", true).single();
  if (locationError || !municipality) return { ok: false, message: "Choose a valid city or municipality.", fieldErrors: { municipalityCode: ["Choose a city or municipality from the list."] } };
  const row = { code: input.code, name: input.name, description: input.description || null, address: input.address, municipality_code: municipality.code, contact_person: input.contactPerson || null, contact_number: input.contactNumber || null, status: input.status, updated_by: actor.userId };
  const result = id ? await supabase.from("warehouses").update(row).eq("id", id).select("id").single() : await supabase.from("warehouses").insert({ ...row, created_by: actor.userId }).select("id").single();
  if (result.error) {
    const retirementErrors = [
      "Move or reconcile warehouse stock before marking it inactive",
      "Resolve in-flight warehouse transfers before marking it inactive",
      "Receive or cancel open warehouse purchase orders before marking it inactive",
    ];
    const retirementError = retirementErrors.find((message) => result.error.message.includes(message));
    return { ok: false, message: retirementError ?? (result.error.code === "23505" ? (result.error.message.includes("warehouses_name_unique") ? "A warehouse with this name already exists." : "That warehouse code is already in use.") : `Unable to save warehouse: ${result.error.message}`) };
  }
  if (photo) {
    try { await saveRecordPhoto("warehouses", result.data.id, photo); }
    catch (error) { revalidatePath("/warehouses"); return { ok: true, data: { id: result.data.id }, message: error instanceof Error ? error.message : "The record was saved, but its photo could not be uploaded." }; }
  }
  revalidatePath("/dashboard"); revalidatePath("/warehouses");
  return { ok: true, data: { id: result.data.id } };
}

export async function assignWarehouseStaffAction(form: FormData) {
  const actor = await requireManager();
  const parsed = warehouseAssignmentInputSchema.safeParse({ warehouseId: value(form, "warehouseId"), userId: value(form, "userId"), assignedOn: value(form, "assignedOn") });
  if (!parsed.success) throw new Error("Invalid warehouse assignment.");
  const supabase = await createClient();
  const { error } = await supabase.from("warehouse_assignments").insert({ warehouse_id: parsed.data.warehouseId, user_id: parsed.data.userId, assigned_on: parsed.data.assignedOn, assigned_by: actor.userId });
  if (error) throw new Error(error.code === "23505" ? "This person is already assigned." : `Unable to assign staff: ${error.message}`);
  revalidatePath(`/warehouses/${parsed.data.warehouseId}`);
}

export async function endWarehouseAssignmentAction(form: FormData) {
  const actor = await requireManager();
  const id = value(form, "assignmentId"); const warehouseId = value(form, "warehouseId");
  const supabase = await createClient();
  const { error } = await supabase.from("warehouse_assignments").update({ status: "inactive", ended_at: new Date().toISOString(), ended_by: actor.userId }).eq("id", id);
  if (error) throw new Error(`Unable to end assignment: ${error.message}`);
  revalidatePath(`/warehouses/${warehouseId}`);
}

export async function linkWarehouseProjectAction(form: FormData) {
  const actor = await requireManager();
  const warehouseId = value(form, "warehouseId"); const projectId = value(form, "projectId");
  const supabase = await createClient();
  const { error } = await supabase.from("project_warehouses").insert({ warehouse_id: warehouseId, project_id: projectId, authorized_by: actor.userId });
  if (error) throw new Error(error.code === "23505" ? "This project is already linked." : `Unable to link project: ${error.message}`);
  revalidatePath(`/warehouses/${warehouseId}`);
}
