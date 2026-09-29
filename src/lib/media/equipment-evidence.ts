import "server-only";
import type { SupabaseClient } from "@supabase/supabase-js";
import type { Database } from "@/types/database";

export async function storeEquipmentEvidence(
  client: SupabaseClient<Database>,
  userId: string,
  idempotencyKey: string,
  photos: readonly [Buffer, Buffer],
) {
  const bucket = client.storage.from("erp-equipment-evidence");
  for (const [index, phase] of (["start", "end"] as const).entries()) {
    const path = `${userId}/${idempotencyKey}/${phase}.webp`;
    const { error } = await bucket.upload(path, photos[index], {
      contentType: "image/webp", upsert: false, cacheControl: "31536000",
    });
    if (!error) continue;
    const existing = await bucket.download(path);
    if (existing.error || !existing.data)
      throw new Error("Equipment photos could not be uploaded. Retry the same entry.");
    const previous = Buffer.from(await existing.data.arrayBuffer());
    if (!previous.equals(photos[index]))
      throw new Error("A different photo was already uploaded for this entry. Start a new entry.");
  }
}
