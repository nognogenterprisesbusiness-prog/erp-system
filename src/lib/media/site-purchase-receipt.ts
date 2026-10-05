import "server-only";
import type { SupabaseClient } from "@supabase/supabase-js";
import type { Database } from "@/types/database";

// Stores the receipt photo before the purchase is submitted. The submit
// command checks this exact path, so a retry with the same key reuses it.
export async function storeSitePurchaseReceipt(client: SupabaseClient<Database>, userId: string, idempotencyKey: string, photo: Buffer) {
  const bucket = client.storage.from("erp-site-purchase-receipts");
  const path = `${userId}/${idempotencyKey}/receipt.webp`;
  const { error } = await bucket.upload(path, photo, { contentType: "image/webp", upsert: false, cacheControl: "31536000" });
  if (!error) return;
  const existing = await bucket.download(path);
  if (existing.error || !existing.data) throw new Error("The receipt photo could not be uploaded. Try again.");
  if (!Buffer.from(await existing.data.arrayBuffer()).equals(photo))
    throw new Error("A different receipt photo was already uploaded for this purchase. Start a new purchase.");
}
