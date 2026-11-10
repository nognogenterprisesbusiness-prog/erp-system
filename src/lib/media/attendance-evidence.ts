import "server-only";
import type { SupabaseClient } from "@supabase/supabase-js";
import type { Database } from "@/types/database";
import { uuidSchema } from "@nognog/domain";

export async function storeAttendanceEvidence(client: SupabaseClient<Database>, userId: string, key: string, photo: Buffer) {
  const bucket = client.storage.from("erp-attendance-evidence");
  const path = `${userId}/${key}/face.webp`;
  const upload = await bucket.upload(path, photo, { contentType: "image/webp", upsert: false, cacheControl: "0" });
  if (!upload.error) return;
  const previous = await bucket.download(path);
  if (previous.error || !previous.data) throw new Error("The face photo could not be uploaded. Retry the same scan.");
  if (!Buffer.from(await previous.data.arrayBuffer()).equals(photo))
    throw new Error("This scan already has a different photo. Retry with the original photo.");
}

export async function readAttendancePhoto(client: SupabaseClient<Database>, scanId: string) {
  if (!uuidSchema.safeParse(scanId).success) return new Response(null, { status: 404 });
  const record = await client.from("attendance_scan_photos").select("photo_path").eq("scan_id", scanId).maybeSingle();
  if (record.error || !record.data) return new Response(null, { status: 404 });
  const photo = await client.storage.from("erp-attendance-evidence").download(record.data.photo_path);
  if (photo.error || !photo.data) return new Response(null, { status: 404 });
  return new Response(photo.data, { headers: { "Content-Type": "image/webp", "Cache-Control": "private, no-store", "X-Content-Type-Options": "nosniff" } });
}
