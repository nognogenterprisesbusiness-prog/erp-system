import "server-only";
import { createClient } from "@/lib/supabase/server";
import type { RecordPhotoKind } from "./record-photo-url";
import { verifyRecordPhoto } from "./verify-record-photo";


export async function prepareRecordPhoto(value: FormDataEntryValue | null): Promise<Buffer | undefined> {
  if (value === null || (value instanceof File && value.size === 0)) return undefined;
  if (!(value instanceof File) || value.size > 3_000_000) {
    throw new Error("Choose a PNG or JPEG under 3 MB, or a larger image that can be compressed before saving.");
  }
  return verifyRecordPhoto(Buffer.from(await value.arrayBuffer()));
}

export async function saveRecordPhoto(kind: RecordPhotoKind, id: string, bytes: Buffer) {
  const supabase = await createClient();
  const path = `${kind}/${id}/cover.webp`;
  const { error: uploadError } = await supabase.storage.from("erp-record-photos").upload(path, bytes, { contentType: "image/webp", upsert: true, cacheControl: "0" });
  if (uploadError) {
    console.error(`Photo upload failed for ${kind}:`, uploadError);
    throw new Error(`Photo storage rejected the upload (${uploadError.statusCode ?? "unknown status"}: ${uploadError.message}).`);
  }
  if (kind === "projects" || kind === "warehouses") {
    const result = kind === "projects"
      ? await supabase.from("projects").update({ photo_path: path }).eq("id", id).select("id").single()
      : await supabase.from("warehouses").update({ photo_path: path }).eq("id", id).select("id").single();
    if (result.error || !result.data) {
      console.error(`Photo attachment failed for ${kind}:`, result.error);
      throw new Error(`Photo uploaded, but could not be attached to the record (${result.error?.message ?? "no matching record"}).`);
    }
    return;
  }
  const result = kind === "assets" ? await supabase.rpc("attach_asset_photo", { p_asset_id: id })
    : kind === "daily-reports" ? await supabase.rpc("attach_daily_report_photo", { p_report_id: id })
    : kind === "suppliers" ? await supabase.rpc("attach_supplier_photo", { p_supplier_id: id })
    : await supabase.rpc("attach_material_photo", { p_material_id: id });
  if (result.error) {
    console.error(`Photo attachment failed for ${kind}:`, result.error);
    throw new Error("The record was saved, but its photo could not be attached. Please retry the photo.");
  }
}
