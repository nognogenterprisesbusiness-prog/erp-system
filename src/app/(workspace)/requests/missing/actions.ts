"use server";

import { revalidatePath } from "next/cache";
import { z } from "zod";
import { materialSourcingSchema, uuidSchema } from "@nognog/domain";
import { requireUser } from "@/lib/auth";
import { createClient } from "@/lib/supabase/server";
import { todayInManila } from "@/lib/date";

export type MissingMaterialState = { ok: boolean; message: string };
const value = (form: FormData, key: string) => String(form.get(key) ?? "");
const dismissSchema = z.object({ id: uuidSchema, note: z.string().trim().min(3).max(500) });
const siteRequestSchema = z.object({
  key: uuidSchema, id: uuidSchema, materialId: uuidSchema,
  quantity: z.coerce.number().positive().max(1_000_000_000).refine((value) => Math.round(value * 10_000) === value * 10_000),
  note: z.string().trim().min(3).max(500),
});

export async function submitMissingMaterialAction(_: MissingMaterialState, form: FormData): Promise<MissingMaterialState> {
  const user = await requireUser();
  if (!user.roles.some((role) => role === "engineer" || role === "foreman"))
    return { ok: false, message: "Only assigned site staff can report a missing material." };
  const parsed = materialSourcingSchema.safeParse({
    key: value(form, "key"), projectId: value(form, "projectId"), siteId: value(form, "siteId"),
    warehouseId: value(form, "warehouseId"), name: value(form, "name"), unit: value(form, "unit"),
    quantity: value(form, "quantity"), neededOn: value(form, "neededOn"), reason: value(form, "reason"),
  });
  if (!parsed.success || (parsed.success && parsed.data.neededOn < todayInManila()))
    return { ok: false, message: "Review the material, quantity, and needed date." };
  const input = parsed.data;
  const db = await createClient();
  const { error } = await db.rpc("submit_material_sourcing_request", {
    p_key: input.key, p_project_id: input.projectId, p_site_id: input.siteId,
    p_warehouse_id: input.warehouseId, p_material_name: input.name,
    p_unit_name: input.unit, p_quantity: Number(input.quantity), p_needed_on: input.neededOn,
    p_reason: input.reason,
  });
  if (error) return { ok: false, message: error.code === "42501" ? "You are not assigned to this project site." : "The missing material could not be reported. Review the details and try again." };
  revalidatePath("/requests");
  return { ok: true, message: "Sent to Admin for review. No stock was added." };
}

export async function dismissMissingMaterialAction(_: MissingMaterialState, form: FormData): Promise<MissingMaterialState> {
  const user = await requireUser();
  if (!user.canManage) return { ok: false, message: "Only Admin can close a missing material report." };
  const parsed = dismissSchema.safeParse({ id: value(form, "id"), note: value(form, "note") });
  if (!parsed.success) return { ok: false, message: "Enter a reason to dismiss this report." };
  const input = parsed.data;
  const db = await createClient();
  const { error } = await db.rpc("resolve_material_sourcing_request", {
    p_id: input.id, p_action: "dismissed", p_material_id: null, p_note: input.note,
  });
  if (error) return { ok: false, message: error.message.includes("Cancel the active purchase")
    ? "Cancel the active supplier purchase before dismissing this report."
    : error.message.includes("site requests cannot be dismissed") ? "This report already has site requests and cannot be dismissed."
      : "The report could not be dismissed. Refresh and try again." };
  revalidatePath("/requests");
  return { ok: true, message: "Report dismissed." };
}

export async function createSourcingSiteRequestAction(_: MissingMaterialState, form: FormData): Promise<MissingMaterialState> {
  const user = await requireUser();
  if (!user.canManage) return { ok: false, message: "Only Admin can prepare a site request." };
  const parsed = siteRequestSchema.safeParse({
    key: value(form, "key"), id: value(form, "id"), materialId: value(form, "materialId"),
    quantity: value(form, "quantity"), note: value(form, "note"),
  });
  if (!parsed.success) return { ok: false, message: "Choose a material, quantity and note." };
  const input = parsed.data;
  const { error } = await (await createClient()).rpc("create_sourcing_material_request", {
    p_idempotency_key: input.key, p_report_id: input.id, p_material_id: input.materialId,
    p_quantity: input.quantity, p_note: input.note,
  });
  if (error) return { ok: false, message: error.message.includes("Receive this quantity")
    ? "Receive the material into the source warehouse before creating its site request."
    : error.message.includes("exceeds remaining") ? "The quantity exceeds what remains on this report."
      : "The site request could not be created. Check the material and quantity, then retry." };
  revalidatePath("/requests");
  return { ok: true, message: "Site request created. The Engineer must review it before warehouse delivery." };
}
