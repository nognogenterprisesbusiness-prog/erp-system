import type { SupabaseClient } from "@supabase/supabase-js";
import type { Database } from "@/types/database";
import { uuidSchema } from "@nognog/domain";

export async function readRecordPhoto(
  client: SupabaseClient<Database>,
  kind: string,
  id: string,
) {
  if (!uuidSchema.safeParse(id).success)
    return new Response(null, { status: 404 });
  const result =
    kind === "projects"
      ? await client
          .from("projects")
          .select("photo_path")
          .eq("id", id)
          .is("archived_at", null)
          .maybeSingle()
      : kind === "warehouses"
        ? await client
            .from("warehouses")
            .select("photo_path")
            .eq("id", id)
            .maybeSingle()
        : kind === "daily-reports"
          ? await client
              .from("daily_reports")
              .select("photo_path")
              .eq("id", id)
              .maybeSingle()
          : kind === "materials"
            ? await client
                .from("materials")
                .select("photo_path")
                .eq("id", id)
                .is("archived_at", null)
                .maybeSingle()
            : kind === "assets"
              ? await client
                  .from("assets")
                  .select("photo_path")
                  .eq("id", id)
                  .is("archived_at", null)
                  .maybeSingle()
              : kind === "suppliers"
                ? await client
                    .from("suppliers")
                    .select("photo_path")
                    .eq("id", id)
                    .maybeSingle()
                : null;
  const path = `${kind}/${id}/cover.webp`;
  if (result?.error || result?.data?.photo_path !== path)
    return new Response(null, { status: 404 });
  const photo = await client.storage.from("erp-record-photos").download(path);
  if (photo.error || !photo.data) return new Response(null, { status: 404 });
  return new Response(await photo.data.arrayBuffer(), {
    headers: {
      "Content-Type": "image/webp",
      "Cache-Control": "private, no-store",
      "X-Content-Type-Options": "nosniff",
    },
  });
}
