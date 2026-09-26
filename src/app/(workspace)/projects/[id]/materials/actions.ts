"use server";

import { revalidatePath } from "next/cache";
import { projectMaterialPlanInputSchema } from "@nognog/domain";
import { requireUser } from "@/lib/auth";
import { createClient } from "@/lib/supabase/server";

export type PlanActionState = { message: string; ok?: boolean; fieldErrors?: Record<string, string[]> };
const value = (form: FormData, key: string) => String(form.get(key) ?? "");

export async function saveProjectMaterialPlanAction(_: PlanActionState, form: FormData): Promise<PlanActionState> {
  const user = await requireUser();
  if (!user.canManage && !user.roles.includes("engineer")) return { message: "Only an administrator or assigned engineer can edit the plan." };
  const parsed = projectMaterialPlanInputSchema.safeParse({
    projectId: value(form, "projectId"), siteId: value(form, "siteId"),
    warehouseId: value(form, "warehouseId"), materialId: value(form, "materialId"),
    quantity: value(form, "quantity"), requiredOn: value(form, "requiredOn"), note: value(form, "note"),
  });
  if (!parsed.success) return { message: "Review the planned material details.", fieldErrors: parsed.error.flatten().fieldErrors };
  const input = parsed.data;
  const supabase = await createClient();
  const { error } = await supabase.rpc("save_project_material_plan_line", {
    p_project_id: input.projectId, p_site_id: input.siteId, p_warehouse_id: input.warehouseId,
    p_material_id: input.materialId, p_quantity: input.quantity, p_required_on: input.requiredOn,
    p_note: input.note,
  });
  if (error) return { message: error.code === "42501" ? "You cannot edit this project's plan." : "The material plan could not be saved. Check the project, site and warehouse." };
  revalidatePath(`/projects/${input.projectId}/materials`);
  return { message: "Material plan saved.", ok: true };
}
