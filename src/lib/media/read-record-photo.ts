import type { SupabaseClient } from "@supabase/supabase-js";
import type { Database } from "@/types/database";
import { uuidSchema } from "@nognog/domain";

const photoTables = {
  projects: { table: "projects", archivable: true },
  warehouses: { table: "warehouses", archivable: false },
  "daily-reports": { table: "daily_reports", archivable: false },
  materials: { table: "materials", archivable: true },
  assets: { table: "assets", archivable: true },
  suppliers: { table: "suppliers", archivable: false },
} as const;

export async function readRecordPhoto(
  client: SupabaseClient<Database>,
  kind: string,
  id: string,
) {
  if (!Object.hasOwn(photoTables, kind) || !uuidSchema.safeParse(id).success)
    return new Response(null, { status: 404 });
  const { table, archivable } = photoTables[kind as keyof typeof photoTables];
  const path = `${kind}/${id}/cover.webp`;
  let record = client.from(table).select("photo_path").eq("id", id);
  if (archivable) record = record.is("archived_at", null);
  // The record check and the private download run together; the photo is only
  // returned when the RLS-visible record still points at this exact path.
  const [result, photo] = await Promise.all([
    record.maybeSingle(),
    client.storage.from("erp-record-photos").download(path),
  ]);
  if (result.error || result.data?.photo_path !== path || photo.error || !photo.data)
    return new Response(null, { status: 404 });
  return new Response(await photo.data.arrayBuffer(), {
    headers: {
      "Content-Type": "image/webp",
      "Cache-Control": "private, max-age=300",
      "X-Content-Type-Options": "nosniff",
    },
  });
}
