import { notFound } from "next/navigation";
import { uuidSchema } from "@nognog/domain";
import { requireFinanceViewer } from "@/lib/auth";
import { createClient } from "@/lib/supabase/server";

export async function GET(_: Request, { params }: { params: Promise<{ id: string; usageId: string; phase: string }> }) {
  await requireFinanceViewer();
  const { id, usageId, phase } = await params;
  if (!uuidSchema.safeParse(id).success || !uuidSchema.safeParse(usageId).success
    || (phase !== "start" && phase !== "end")) notFound();
  const db = await createClient();
  const { data: usage, error } = await db.from("project_equipment_usage")
    .select("project_id,start_photo_path,end_photo_path").eq("id", usageId).eq("project_id", id).maybeSingle();
  if (error || !usage) notFound();
  const path = phase === "start" ? usage.start_photo_path : usage.end_photo_path;
  if (!path) notFound();
  const photo = await db.storage.from("erp-equipment-evidence").download(path);
  if (photo.error || !photo.data) notFound();
  return new Response(await photo.data.arrayBuffer(), {
    headers: { "Content-Type": "image/webp", "Cache-Control": "private, no-store", "X-Content-Type-Options": "nosniff" },
  });
}
