"use server";
import { revalidatePath } from "next/cache";
import { equipmentInputSchema, vehicleInputSchema, uuidSchema } from "@nognog/domain";
import type { ActionResult } from "@nognog/domain";
import { requireManager } from "@/lib/auth";
import { createClient } from "@/lib/supabase/server";
import { prepareRecordPhoto, saveRecordPhoto } from "@/lib/media/record-photo";
import type { AssetKind } from "@/types/database";

export type AssetActionState = ActionResult<{ id: string }> & { savedId?: string };
const value = (form: FormData, key: string) => String(form.get(key) ?? "");
const failure = (message: string, fieldErrors?: Record<string, string[]>): AssetActionState => ({ ok: false, message, fieldErrors });

function assetPayload(form: FormData) {
  return {
    id: value(form, "id") || undefined,
    code: value(form, "code").toUpperCase(),
    name: value(form, "name"),
    description: value(form, "description"),
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
  if (error.code === "23505") return "The asset code, serial number or plate number is already in use.";
  if (error.message.includes("location")) return "The selected location is unavailable.";
  if (error.message.includes("return the vehicle")) return "Return the vehicle before changing its status or location.";
  if (error.message.includes("return the equipment")) return "Return the equipment before editing its registry details.";
  if (error.message.includes("assigned or in-use")) return "Return the asset before archiving it.";
  return "The asset registry change could not be saved.";
}

export async function saveAssetAction(_: AssetActionState, form: FormData): Promise<AssetActionState> {
  try { await requireManager(); } catch { return failure("You do not have permission to manage assets."); }
  const kind = value(form, "assetKind");
  const base = assetPayload(form);
  const fail = (message: string, fieldErrors?: Record<string, string[]>): AssetActionState => ({ ...failure(message, fieldErrors), savedId: base.id });
  let photo: Buffer | undefined;
  try { photo = await prepareRecordPhoto(form.get("photo")); }
  catch (cause) { return fail(cause instanceof Error ? cause.message : "The asset photo could not be processed."); }
  if (value(form, "photoSelected") === "1" && !photo) return fail("The selected photo was not attached. Choose it again before saving.");
  const supabase = await createClient();
  let savedId: string;
  if (kind === "equipment") {
    const parsed = equipmentInputSchema.safeParse({ ...base, sku: value(form, "sku").toUpperCase(), equipmentType: value(form, "equipmentType"), serialNumber: value(form, "serialNumber").toUpperCase(), acquisitionCost: value(form, "acquisitionCost") });
    if (!parsed.success) return fail("Review the highlighted equipment details.", parsed.error.flatten().fieldErrors);
    const input = parsed.data;
    const result = await supabase.rpc("save_equipment_with_sku", {
      p_id: input.id ?? null, p_code: input.code, p_name: input.name, p_description: input.description || "", p_category_id: null,
      p_brand: input.brand, p_model: input.model, p_acquisition_date: input.acquisitionDate, p_ownership_type: input.ownershipType, p_status: input.status,
      p_location_id: input.currentLocationId, p_condition_notes: input.conditionNotes || "", p_equipment_type: input.equipmentType,
      p_serial_number: input.serialNumber, p_acquisition_cost: input.acquisitionCost, p_sku: input.sku,
    });
    if (result.error) return fail(friendlyAssetError(result.error));
    savedId = result.data;
  } else if (kind === "vehicle") {
    const parsed = vehicleInputSchema.safeParse({ ...base, vehicleType: value(form, "vehicleType"), plateNumber: value(form, "plateNumber").toUpperCase() });
    if (!parsed.success) return fail("Review the highlighted vehicle details.", parsed.error.flatten().fieldErrors);
    const input = parsed.data;
    const result = await supabase.rpc("save_vehicle", {
      p_id: input.id ?? null, p_code: input.code, p_name: input.name, p_vehicle_type: input.vehicleType,
      p_plate_number: input.plateNumber, p_location_id: input.currentLocationId,
      p_ownership_type: input.ownershipType, p_status: input.status, p_condition_notes: input.conditionNotes || "",
    });
    if (result.error) return fail(friendlyAssetError(result.error));
    savedId = result.data;
  } else return failure("Unsupported asset type.");
  if (photo) {
    try { await saveRecordPhoto("assets", savedId, photo); }
    catch (cause) {
      revalidatePath(kind === "equipment" ? "/equipment" : "/vehicles");
      revalidatePath(`/${kind === "equipment" ? "equipment" : "vehicles"}/${savedId}`);
      return { ok: false, savedId, message: `The asset was saved, but its photo was not. ${cause instanceof Error ? cause.message : "Retry the photo upload."}` };
    }
  }
  revalidatePath(kind === "equipment" ? "/equipment" : "/vehicles");
  revalidatePath(`/${kind === "equipment" ? "equipment" : "vehicles"}/${savedId}`);
  return { ok: true, data: { id: savedId } };
}

export async function archiveAssetAction(_: AssetActionState, form: FormData): Promise<AssetActionState> {
  try { await requireManager(); } catch { return failure("You do not have permission to archive assets."); }
  const id = value(form, "id"); const reason = value(form, "reason").trim(); const kind = value(form, "assetKind") as AssetKind;
  if (!uuidSchema.safeParse(id).success || reason.length < 3 || reason.length > 2000 || !["equipment", "vehicle"].includes(kind)) return failure("Select a valid asset and enter a reason between 3 and 2,000 characters.");
  const supabase = await createClient();
  const { error } = await supabase.rpc("archive_asset", { p_id: id, p_reason: reason });
  if (error) return failure(friendlyAssetError(error));
  revalidatePath(kind === "equipment" ? "/equipment" : "/vehicles");
  revalidatePath(`/${kind === "equipment" ? "equipment" : "vehicles"}/${id}`);
  return { ok: true, data: { id } };
}
