import { uuidSchema } from "@nognog/domain";
import { requireUser } from "@/lib/auth";
import { createClient } from "@/lib/supabase/server";

// Receipt photo for a site purchase. Table and storage policies decide access.
export async function GET(_: Request, { params }: { params: Promise<{ id: string }> }) {
  await requireUser();
  const { id } = await params;
  if (!uuidSchema.safeParse(id).success) return new Response(null, { status: 404 });
  const supabase = await createClient();
  const { data: purchase } = await supabase.from("site_purchases").select("receipt_photo_path").eq("id", id).maybeSingle();
  if (!purchase) return new Response(null, { status: 404 });
  const { data, error } = await supabase.storage.from("erp-site-purchase-receipts").download(purchase.receipt_photo_path);
  if (error || !data) return new Response(null, { status: 404 });
  return new Response(data, { headers: { "Content-Type": "image/webp", "Cache-Control": "private, max-age=3600", "X-Content-Type-Options": "nosniff" } });
}
