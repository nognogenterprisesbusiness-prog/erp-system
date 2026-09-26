import { createClient } from "@/lib/supabase/server";

const validId = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

export async function GET(_: Request, { params }: { params: Promise<{ kind: string; id: string }> }) {
  const { kind, id } = await params;
  if ((kind !== "projects" && kind !== "warehouses" && kind !== "daily-reports" && kind !== "materials" && kind !== "suppliers" && kind !== "assets") || !validId.test(id)) return new Response(null, { status: 404 });
  const supabase = await createClient();
  const { data: claims } = await supabase.auth.getClaims();
  if (!claims?.claims?.sub) return new Response(null, { status: 401 });
  const result = kind === "projects"
    ? await supabase.from("projects").select("photo_path").eq("id", id).is("archived_at", null).maybeSingle()
    : kind === "warehouses" ? await supabase.from("warehouses").select("photo_path").eq("id", id).maybeSingle()
    : kind === "daily-reports" ? await supabase.from("daily_reports").select("photo_path").eq("id", id).maybeSingle()
    : kind === "suppliers" ? await supabase.from("suppliers").select("photo_path").eq("id", id).maybeSingle()
    : kind === "assets" ? await supabase.from("assets").select("photo_path").eq("id", id).is("archived_at", null).maybeSingle()
    : await supabase.from("materials").select("photo_path").eq("id", id).is("archived_at", null).maybeSingle();
  if (!result.data?.photo_path) return new Response(null, { status: 404 });
  const path = `${kind}/${id}/cover.webp`;
  if (result.data.photo_path !== path) return new Response(null, { status: 404 });
  const { data, error } = await supabase.storage.from("erp-record-photos").download(path);
  if (error || !data) return new Response(null, { status: 404 });
  return new Response(await data.arrayBuffer(), { headers: { "Content-Type": "image/webp", "Cache-Control": "private, no-store", "X-Content-Type-Options": "nosniff" } });
}
