"use server";
import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { categoryInputSchema, materialInputSchema } from "@nognog/domain";
import type { ActionResult } from "@nognog/domain";
import { requireManager } from "@/lib/auth";
import { createClient } from "@/lib/supabase/server";
import { prepareRecordPhoto, saveRecordPhoto } from "@/lib/media/record-photo";

export type MaterialActionState = ActionResult<{ id: string }>;
const value = (form: FormData, key: string) => String(form.get(key) ?? "");
const failure = (message: string): MaterialActionState => ({ ok: false, message });

export async function saveCategoryAction(_: MaterialActionState, form: FormData): Promise<MaterialActionState> {
  try { await requireManager(); } catch { return failure("You do not have permission to manage categories."); }
  const parsed = categoryInputSchema.safeParse({ id: value(form, "id") || undefined, name: value(form, "name"), description: value(form, "description") });
  if (!parsed.success) return { ok: false, message: "Review the category details.", fieldErrors: parsed.error.flatten().fieldErrors };
  const supabase = await createClient();
  const { error } = await supabase.rpc("save_material_category", { p_id: parsed.data.id ?? null, p_name: parsed.data.name, p_description: parsed.data.description || "" });
  if (error) return failure(error.code === "23505" ? "A category with this name already exists." : "The category could not be saved.");
  revalidatePath("/materials/categories"); revalidatePath("/materials");
  redirect("/materials/categories");
}

export async function archiveCategoryAction(form: FormData) {
  await requireManager(); const id = value(form, "id");
  const supabase = await createClient(); const { error } = await supabase.rpc("archive_material_category", { p_id: id });
  if (error) throw new Error("The category could not be archived.");
  revalidatePath("/materials/categories"); revalidatePath("/materials");
}

export async function saveMaterialAction(_: MaterialActionState, form: FormData): Promise<MaterialActionState> {
  try { await requireManager(); } catch { return failure("You do not have permission to manage materials."); }
  const parsed = materialInputSchema.safeParse({ id: value(form, "id") || undefined, code: value(form, "code").toUpperCase(), name: value(form, "name"), description: value(form, "description"), categoryId: value(form, "categoryId"), baseUnitId: value(form, "baseUnitId"), materialKind: value(form, "materialKind"), minimumStockLevel: value(form, "minimumStockLevel"), isActive: value(form, "isActive") });
  if (!parsed.success) return { ok: false, message: "Review the material details.", fieldErrors: parsed.error.flatten().fieldErrors };
  if (parsed.data.materialKind !== "consumable") return failure("Register reusable tools in Equipment. Legacy reusable materials are read-only.");
  let photo: Buffer | undefined;
  try { photo = await prepareRecordPhoto(form.get("photo")); }
  catch (cause) { return failure(cause instanceof Error ? cause.message : "The material photo could not be processed."); }
  const input = parsed.data; const supabase = await createClient();
  const { data, error } = await supabase.rpc("save_material", { p_id: input.id ?? null, p_code: input.code, p_name: input.name, p_description: input.description || "", p_category_id: input.categoryId, p_base_unit_id: input.baseUnitId, p_material_kind: input.materialKind, p_minimum_stock_level: input.minimumStockLevel, p_is_active: input.isActive === "true" });
  if (error) return failure(error.code === "23505" ? (error.message.includes("materials_name_unit_unique") ? "A material with this name and unit already exists." : "That material code is already in use.") : "The material could not be saved.");
  if (photo) {
    try { await saveRecordPhoto("materials", data, photo); }
    catch (cause) { return failure(cause instanceof Error ? cause.message : "The material was saved, but its photo could not be attached. Open the material again to retry."); }
  }
  revalidatePath("/materials"); revalidatePath("/inventory");
  return { ok: true, data: { id: data } };
}

export async function archiveMaterialAction(form: FormData) {
  await requireManager(); const id = value(form, "id");
  const supabase = await createClient(); const { error } = await supabase.rpc("archive_material", { p_id: id });
  if (error) throw new Error("The material could not be archived.");
  revalidatePath("/materials"); revalidatePath("/inventory"); redirect("/materials");
}
