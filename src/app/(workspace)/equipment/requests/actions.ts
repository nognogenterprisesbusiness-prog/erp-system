"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { equipmentRequestDecisionSchema, equipmentRequestInputSchema, equipmentReturnInputSchema, uuidSchema } from "@nognog/domain";
import { requireManager, requireUser } from "@/lib/auth";
import { createClient } from "@/lib/supabase/server";
import { submitSiteEquipmentRequest } from '@/lib/mobile/equipment-request';

export type EquipmentRequestActionState = { ok: boolean; message: string };
const failure = (message: string): EquipmentRequestActionState => ({ ok: false, message });
const field = (form: FormData, name: string) => String(form.get(name) ?? "").trim();

function messageFor(error: { code?: string; message: string }) {
  if (error.code === "42501") return "You do not have access to this equipment request.";
  if (error.code === "23505") return "This equipment already has an approved or active handover.";
  if (error.message.includes("custody changed")) return "Equipment custody changed. Review the request before checkout.";
  if (error.message.includes("no longer available") || error.message.includes("not available")) return "Equipment is no longer available.";
  if (error.message.includes("linked warehouse")) return "Choose equipment from a linked warehouse or the selected site.";
  if (error.message.includes("Original location is archived")) return "The original location is archived. Resolve its location before returning this equipment.";
  return "The equipment request could not be updated. Check its current status and try again.";
}

export async function submitEquipmentRequestAction(_: EquipmentRequestActionState, form: FormData): Promise<EquipmentRequestActionState> {
  const user = await requireUser();
  if (user.canManage || !user.roles.some((role) => ["engineer", "foreman"].includes(role))) return failure("Only assigned project staff can request equipment.");
  const parsed = equipmentRequestInputSchema.safeParse({
    assetId: field(form, "assetId"), projectId: field(form, "projectId"), siteId: field(form, "siteId"),
    neededOn: field(form, "neededOn"), expectedReturnOn: field(form, "expectedReturnOn"), purpose: field(form, "purpose"),
  });
  if (!parsed.success) return failure("Choose equipment, an active site, valid dates, and a purpose of at least 3 characters.");
  const input = parsed.data;
  const supabase = await createClient();
  try { await submitSiteEquipmentRequest(supabase, input); }
  catch(cause) { return failure(cause instanceof Error ? cause.message : 'The equipment request could not be saved.'); }
  revalidatePath("/equipment/requests");
  redirect("/equipment/requests");
}

export async function decideEquipmentRequestAction(_: EquipmentRequestActionState, form: FormData): Promise<EquipmentRequestActionState> {
  try { await requireManager(); } catch { return failure("Admin approval is required."); }
  const parsed = equipmentRequestDecisionSchema.safeParse({ id: field(form, "id"), decision: field(form, "decision"), note: field(form, "note") });
  if (!parsed.success)
    return failure("Provide a valid decision and a reason when rejecting.");
  const supabase = await createClient();
  const { error } = await supabase.rpc("decide_equipment_request", { p_id: parsed.data.id, p_approve: parsed.data.decision === "approve", p_note: parsed.data.note });
  if (error) return failure(messageFor(error));
  revalidatePath("/equipment/requests");
  return { ok: true, message: "Decision recorded." };
}

export async function checkoutEquipmentRequestAction(_: EquipmentRequestActionState, form: FormData): Promise<EquipmentRequestActionState> {
  try { await requireManager(); } catch { return failure("Admin handover is required."); }
  const id = uuidSchema.safeParse(field(form, "id"));
  if (!id.success) return failure("Invalid request.");
  const supabase = await createClient();
  const { error } = await supabase.rpc("checkout_equipment_request", { p_id: id.data });
  if (error) return failure(messageFor(error));
  revalidatePath("/equipment/requests"); revalidatePath("/equipment"); revalidatePath(`/equipment/${id.data}`);
  return { ok: true, message: "Equipment checked out." };
}

export async function returnEquipmentRequestAction(_: EquipmentRequestActionState, form: FormData): Promise<EquipmentRequestActionState> {
  try { await requireManager(); } catch { return failure("Admin return is required."); }
  const parsed = equipmentReturnInputSchema.safeParse({ id: field(form, "id"), needsMaintenance: field(form, "needsMaintenance") === "on", note: field(form, "note") });
  if (!parsed.success) return failure("Record the equipment condition in at least 3 characters.");
  const supabase = await createClient();
  const { error } = await supabase.rpc("return_equipment_request", {
    p_id: parsed.data.id, p_needs_maintenance: parsed.data.needsMaintenance, p_note: parsed.data.note,
  });
  if (error) return failure(messageFor(error));
  revalidatePath("/equipment/requests"); revalidatePath("/equipment");
  return { ok: true, message: "Equipment return recorded." };
}
