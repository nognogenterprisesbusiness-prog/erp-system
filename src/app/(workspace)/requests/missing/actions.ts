"use server";

import { revalidatePath } from "next/cache";
import { z } from "zod";
import { materialSourcingSchema, uuidSchema } from "@nognog/domain";
import { requireUser } from "@/lib/auth";
import { createClient } from "@/lib/supabase/server";
import { todayInManila } from "@/lib/date";

export type MissingMaterialState = { ok: boolean; message: string };
const value = (form: FormData, key: string) => String(form.get(key) ?? "");
const resolveSchema = z.object({
  id: uuidSchema, action: z.enum(["resolved", "dismissed"]),
  materialId: z.union([uuidSchema, z.literal("")]),
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
  revalidatePath("/requests/missing");
  return { ok: true, message: "Sent to Admin for review. No stock was added." };
}

export async function resolveMissingMaterialAction(_: MissingMaterialState, form: FormData): Promise<MissingMaterialState> {
  const user = await requireUser();
  if (!user.canManage) return { ok: false, message: "Only Admin can close a missing material report." };
  const parsed = resolveSchema.safeParse({
    id: value(form, "id"), action: value(form, "action"),
    materialId: value(form, "materialId"), note: value(form, "note"),
  });
  if (!parsed.success || (parsed.data.action === "resolved" && !parsed.data.materialId)
    || (parsed.data.action === "dismissed" && parsed.data.materialId))
    return { ok: false, message: "Choose a catalog material to resolve, or dismiss with a reason." };
  const input = parsed.data;
  const db = await createClient();
  const { error } = await db.rpc("resolve_material_sourcing_request", {
    p_id: input.id, p_action: input.action, p_material_id: input.materialId || null, p_note: input.note,
  });
  if (error) return { ok: false, message: error.message.includes("not available in the source warehouse")
    ? "Receive this material into the source warehouse before closing the report."
    : "The report could not be closed. Refresh and try again." };
  revalidatePath("/requests/missing");
  return { ok: true, message: "Report closed." };
}
