"use server";
import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { materialInputSchema } from "@nognog/domain";
import type { ActionResult } from "@nognog/domain";
import { requireManager } from "@/lib/auth";
import { createClient } from "@/lib/supabase/server";
import { prepareRecordPhoto, saveRecordPhoto } from "@/lib/media/record-photo";
import { saveMaterialCatalog } from "@/lib/materials/save-catalog";

export type MaterialActionState = ActionResult<{ id: string }>;
const value = (form: FormData, key: string) => String(form.get(key) ?? "");
const failure = (message: string): MaterialActionState => ({ ok: false, message });

export async function saveMaterialAction(_: MaterialActionState, form: FormData): Promise<MaterialActionState> {
  try { await requireManager(); } catch { return failure("You do not have permission to manage materials."); }
  const parsed = materialInputSchema.safeParse({ id: value(form, "id") || undefined, code: value(form, "code").toUpperCase(), name: value(form, "name"), description: value(form, "description"), baseUnitId: value(form, "baseUnitId"), materialKind: value(form, "materialKind"), minimumStockLevel: value(form, "minimumStockLevel"), isActive: value(form, "isActive") });
  if (!parsed.success) return { ok: false, message: "Review the material details.", fieldErrors: parsed.error.flatten().fieldErrors };
  if (parsed.data.materialKind !== "consumable") return failure("Register reusable tools in Equipment. Legacy reusable materials are read-only.");
  let photo: Buffer | undefined;
  try { photo = await prepareRecordPhoto(form.get("photo")); }
  catch (cause) { return failure(cause instanceof Error ? cause.message : "The material photo could not be processed."); }
  const input = parsed.data; const supabase = await createClient();
  let result: Awaited<ReturnType<typeof saveMaterialCatalog>>;
  try { result = await saveMaterialCatalog(supabase, input); }
  catch (cause) { return failure(cause instanceof Error ? cause.message : "The material could not be saved."); }
  const { data, error } = result;
  if (error) return failure(error.code === "23505" ? (error.message.includes("materials_name_unit_unique") ? "A material with this name and unit already exists." : "That material code is already in use.") : "The material could not be saved.");
  if (photo) {
    try { await saveRecordPhoto("materials", data, photo); }
    catch (cause) {
      revalidatePath("/inventory");
      if (input.id) revalidatePath(`/materials/${input.id}`);
      return failure(cause instanceof Error ? cause.message : "The material was saved, but its photo could not be attached. Open the material again to retry.");
    }
  }
  revalidatePath("/inventory");
  if (input.id) revalidatePath(`/materials/${input.id}`);
  return { ok: true, data: { id: data } };
}

export async function archiveMaterialAction(form: FormData) {
  await requireManager(); const id = value(form, "id");
  const supabase = await createClient(); const { error } = await supabase.rpc("archive_material", { p_id: id });
  if (error) throw new Error("The material could not be archived.");
  revalidatePath("/inventory"); redirect("/inventory");
}
