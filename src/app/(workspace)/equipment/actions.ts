"use server";
import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { assetCategoryInputSchema, assetLocationInputSchema, equipmentInputSchema, vehicleInputSchema } from "@nognog/domain";
import type { ActionResult } from "@nognog/domain";
import { requireManager } from "@/lib/auth";
import { createClient } from "@/lib/supabase/server";
import type { AssetKind } from "@/types/database";

export type AssetActionState = ActionResult<{ id: string }>;
const value = (form: FormData, key: string) => String(form.get(key) ?? "");
const failure = (message: string, fieldErrors?: Record<string, string[]>): AssetActionState => ({ ok: false, message, fieldErrors });

function assetPayload(form: FormData) {
  return {
    id: value(form, "id") || undefined,
    code: value(form, "code").toUpperCase(),
    name: value(form, "name"),
    description: value(form, "description"),
    categoryId: value(form, "categoryId"),
    brand: value(form, "brand"),
    model: value(form, "model"),
    acquisitionDate: value(form, "acquisitionDate"),
    ownershipType: value(form, "ownershipType"),
    status: value(form, "status"),
    currentLocationId: value(form, "currentLocationId"),
    conditionNotes: value(form, "conditionNotes"),
  };
}

function friendlyAssetError(error: { code?: string; message: string }) {
  if (error.code === "42501") return "You do not have permission to manage the asset registry.";
  if (error.code === "23505") return "The asset code, serial number, plate number, or classification is already in use.";
  if (error.message.includes("mileage cannot decrease")) return "Current mileage cannot be lower than the recorded mileage.";
  if (error.message.includes("category")) return "The selected classification is unavailable or does not match this asset type.";
  if (error.message.includes("location")) return "The selected location is unavailable.";
  if (error.message.includes("assigned or in-use")) return "Return the asset before archiving it.";
  return "The asset registry change could not be saved.";
}

export async function saveAssetAction(_: AssetActionState, form: FormData): Promise<AssetActionState> {
  try { await requireManager(); } catch { return failure("You do not have permission to manage assets."); }
  const kind = value(form, "assetKind");
  const base = assetPayload(form);
  const supabase = await createClient();
  let savedId: string;
  if (kind === "equipment") {
    const parsed = equipmentInputSchema.safeParse({ ...base, sku: value(form, "sku").toUpperCase(), equipmentType: value(form, "equipmentType"), serialNumber: value(form, "serialNumber").toUpperCase(), acquisitionCost: value(form, "acquisitionCost") });
    if (!parsed.success) return failure("Review the highlighted equipment details.", parsed.error.flatten().fieldErrors);
    const input = parsed.data;
    const result = await supabase.rpc("save_equipment_with_sku", {
      p_id: input.id ?? null, p_code: input.code, p_name: input.name, p_description: input.description || "", p_category_id: input.categoryId,
      p_brand: input.brand, p_model: input.model, p_acquisition_date: input.acquisitionDate, p_ownership_type: input.ownershipType, p_status: input.status,
      p_location_id: input.currentLocationId, p_condition_notes: input.conditionNotes || "", p_equipment_type: input.equipmentType,
      p_serial_number: input.serialNumber, p_acquisition_cost: input.acquisitionCost, p_sku: input.sku,
    });
    if (result.error) return failure(friendlyAssetError(result.error));
    savedId = result.data;
  } else if (kind === "vehicle") {
    const parsed = vehicleInputSchema.safeParse({ ...base, plateNumber: value(form, "plateNumber").toUpperCase(), manufactureYear: value(form, "manufactureYear"), currentMileage: value(form, "currentMileage") });
    if (!parsed.success) return failure("Review the highlighted vehicle details.", parsed.error.flatten().fieldErrors);
    const input = parsed.data;
    const result = await supabase.rpc("save_vehicle", {
      p_id: input.id ?? null, p_code: input.code, p_name: input.name, p_description: input.description || "", p_category_id: input.categoryId,
      p_brand: input.brand, p_model: input.model, p_acquisition_date: input.acquisitionDate, p_ownership_type: input.ownershipType, p_status: input.status,
      p_location_id: input.currentLocationId, p_condition_notes: input.conditionNotes || "", p_plate_number: input.plateNumber,
      p_manufacture_year: input.manufactureYear, p_current_mileage: input.currentMileage,
    });
    if (result.error) return failure(friendlyAssetError(result.error));
    savedId = result.data;
  } else return failure("Unsupported asset type.");
  revalidatePath("/dashboard"); revalidatePath("/equipment"); revalidatePath("/vehicles");
  redirect(`/${kind === "equipment" ? "equipment" : "vehicles"}/${savedId}`);
}

export async function archiveAssetAction(_: AssetActionState, form: FormData): Promise<AssetActionState> {
  try { await requireManager(); } catch { return failure("You do not have permission to archive assets."); }
  const id = value(form, "id"); const reason = value(form, "reason").trim(); const kind = value(form, "assetKind") as AssetKind;
  if (!id || reason.length < 3 || !["equipment", "vehicle"].includes(kind)) return failure("Enter an archive reason of at least three characters.");
  const supabase = await createClient();
  const { error } = await supabase.rpc("archive_asset", { p_id: id, p_reason: reason });
  if (error) return failure(friendlyAssetError(error));
  revalidatePath("/dashboard"); revalidatePath("/equipment"); revalidatePath("/vehicles");
  redirect(kind === "equipment" ? "/equipment" : "/vehicles");
}

export async function saveAssetCategoryAction(_: AssetActionState, form: FormData): Promise<AssetActionState> {
  try { await requireManager(); } catch { return failure("You do not have permission to manage classifications."); }
  const parsed = assetCategoryInputSchema.safeParse({ id: value(form, "id") || undefined, assetKind: value(form, "assetKind"), name: value(form, "name"), description: value(form, "description") });
  if (!parsed.success) return failure("Review the classification details.", parsed.error.flatten().fieldErrors);
  const supabase = await createClient();
  const { error } = await supabase.rpc("save_asset_category", { p_id: parsed.data.id ?? null, p_asset_kind: parsed.data.assetKind, p_name: parsed.data.name, p_description: parsed.data.description || "" });
  if (error) return failure(friendlyAssetError(error));
  revalidatePath("/equipment/categories"); revalidatePath("/equipment"); revalidatePath("/vehicles");
  redirect(`/equipment/categories?kind=${parsed.data.assetKind}`);
}

export async function archiveAssetCategoryAction(form: FormData) {
  await requireManager();
  const id = value(form, "id"); const kind = value(form, "assetKind");
  const supabase = await createClient(); const { error } = await supabase.rpc("archive_asset_category", { p_id: id });
  if (error) throw new Error(friendlyAssetError(error));
  revalidatePath("/equipment/categories"); revalidatePath("/equipment"); revalidatePath("/vehicles");
  redirect(`/equipment/categories?kind=${kind}`);
}

export async function saveAssetLocationAction(_: AssetActionState, form: FormData): Promise<AssetActionState> {
  try { await requireManager(); } catch { return failure("You do not have permission to manage asset locations."); }
  const parsed = assetLocationInputSchema.safeParse({ id: value(form, "id") || undefined, locationKind: value(form, "locationKind"), name: value(form, "name"), address: value(form, "address") });
  if (!parsed.success) return failure("Review the location details.", parsed.error.flatten().fieldErrors);
  const supabase = await createClient();
  const { error } = await supabase.rpc("save_asset_location", { p_id: parsed.data.id ?? null, p_location_kind: parsed.data.locationKind, p_name: parsed.data.name, p_address: parsed.data.address });
  if (error) return failure(friendlyAssetError(error));
  revalidatePath("/equipment/locations"); revalidatePath("/equipment"); revalidatePath("/vehicles");
  redirect("/equipment/locations");
}

export async function archiveAssetLocationAction(form: FormData) {
  await requireManager();
  const supabase = await createClient(); const { error } = await supabase.rpc("archive_asset_location", { p_id: value(form, "id") });
  if (error) throw new Error(friendlyAssetError(error));
  revalidatePath("/equipment/locations"); revalidatePath("/equipment"); revalidatePath("/vehicles");
}
