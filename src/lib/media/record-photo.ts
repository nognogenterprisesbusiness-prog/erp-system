import "server-only";
import sharp from "sharp";
import { createClient } from "@/lib/supabase/server";
import type { RecordPhotoKind } from "./record-photo-url";


export async function prepareRecordPhoto(value: FormDataEntryValue | null): Promise<Buffer | undefined> {
  if (value === null || (value instanceof File && value.size === 0)) return undefined;
  if (!(value instanceof File) || value.type !== "image/webp" || value.size > 2_000_000) {
    throw new Error("Choose a PNG or JPEG under 12 MB. The upload must convert to WebP before saving.");
  }
  const source = Buffer.from(await value.arrayBuffer());
  try {
    const image = sharp(source, { limitInputPixels: 32_000_000, failOn: "error" });
    const metadata = await image.metadata();
    if (metadata.format !== "webp" || !metadata.width || !metadata.height || metadata.width > 8192 || metadata.height > 8192 || (metadata.pages ?? 1) !== 1) throw new Error();
    const encoded = await image.rotate().resize(1600, 1600, { fit: "inside", withoutEnlargement: true }).webp({ quality: 80 }).toBuffer();
    if (encoded.length > 2_000_000) throw new Error();
    return encoded;
  } catch {
    throw new Error("The photo could not be verified. Choose another PNG or JPEG image.");
  }
}

export async function saveRecordPhoto(kind: RecordPhotoKind, id: string, bytes: Buffer) {
  const supabase = await createClient();
  const path = `${kind}/${id}/cover.webp`;
  const { error: uploadError } = await supabase.storage.from("erp-record-photos").upload(path, bytes, { contentType: "image/webp", upsert: true, cacheControl: "0" });
  if (uploadError) throw new Error("The record was saved, but its photo could not be uploaded.");
  if (kind === "projects" || kind === "warehouses") {
    const result = kind === "projects"
      ? await supabase.from("projects").update({ photo_path: path }).eq("id", id).select("id").single()
      : await supabase.from("warehouses").update({ photo_path: path }).eq("id", id).select("id").single();
    if (result.error || !result.data) throw new Error("The record was saved, but its photo could not be attached.");
    return;
  }
  const result = kind === "daily-reports" ? await supabase.rpc("attach_daily_report_photo", { p_report_id: id })
    : kind === "suppliers" ? await supabase.rpc("attach_supplier_photo", { p_supplier_id: id })
    : await supabase.rpc("attach_material_photo", { p_material_id: id });
  if (result.error) throw new Error("The record was saved, but its photo could not be attached.");
}
