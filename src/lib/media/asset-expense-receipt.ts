import "server-only";
import type { SupabaseClient } from "@supabase/supabase-js";
import type { Database } from "@/types/database";

export const assetExpenseReceiptBucket = "erp-asset-expense-receipts";

export async function storeAssetExpenseReceipt(client: SupabaseClient<Database>, actor: string, requestId: string, photo: Buffer) {
  const bucket = client.storage.from(assetExpenseReceiptBucket);
  const path = `${actor}/${requestId}/receipt.webp`;
  const result = await bucket.upload(path, photo, { contentType: "image/webp", upsert: false });
  if (!result.error) return;
  const existing = await bucket.download(path);
  if (!existing.data || !Buffer.from(await existing.data.arrayBuffer()).equals(photo)) {
    throw new Error("Receipt upload failed or the receipt differs from the original submission.");
  }
}
