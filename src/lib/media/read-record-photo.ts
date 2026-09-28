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
  // Asset photos include requestable warehouse assets outside the caller's registry view.
  const lookup = async () => {
    if (kind === "assets") {
      const r = await client.rpc("get_asset_photo_paths", { p_asset_ids: [id] });
      return { error: r.error, photoPath: r.data?.[0]?.photo_path };
    }
    let record = client.from(table).select("photo_path").eq("id", id);
    if (archivable) record = record.is("archived_at", null);
    const r = await record.maybeSingle();
    return { error: r.error, photoPath: r.data?.photo_path };
  };
  // The record check and the private download run together; the photo is only
  // returned when the visible record still points at this exact path.
  const [result, photo] = await Promise.all([
    lookup(),
    client.storage.from("erp-record-photos").download(path),
  ]);
  if (result.error || result.photoPath !== path || photo.error || !photo.data)
    return new Response(null, { status: 404 });
  return new Response(await photo.data.arrayBuffer(), {
    headers: {
      "Content-Type": "image/webp",
      "Cache-Control": "private, max-age=300",
      "X-Content-Type-Options": "nosniff",
    },
  });
}
