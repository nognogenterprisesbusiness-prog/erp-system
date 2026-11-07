import { z } from "zod";
import { requireFinanceViewer } from "@/lib/auth";
import { createClient } from "@/lib/supabase/server";
import { assetExpenseReceiptBucket } from "@/lib/media/asset-expense-receipt";

export async function GET(_: Request, context: { params: Promise<{ id: string }> }) {
  await requireFinanceViewer();
  const id = z.uuid().safeParse((await context.params).id);
  if (!id.success) return new Response(null, { status: 404 });
  const client = await createClient();
  const { data } = await client.from("asset_expenses").select("receipt_path").eq("id", id.data).maybeSingle();
  if (!data?.receipt_path) return new Response(null, { status: 404 });
  const { data: photo } = await client.storage.from(assetExpenseReceiptBucket).download(data.receipt_path);
  if (!photo) return new Response(null, { status: 404 });
  return new Response(photo, { headers: {
    "Content-Type": "image/webp", "Cache-Control": "private, no-store", "X-Content-Type-Options": "nosniff",
  } });
}
