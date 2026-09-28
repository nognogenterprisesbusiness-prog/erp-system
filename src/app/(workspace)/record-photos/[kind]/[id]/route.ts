import { createClient } from "@/lib/supabase/server";
import { readRecordPhoto } from "@/lib/media/read-record-photo";

const validId = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

export async function GET(_: Request, { params }: { params: Promise<{ kind: string; id: string }> }) {
  const { kind, id } = await params;
  if ((kind !== "projects" && kind !== "warehouses" && kind !== "daily-reports" && kind !== "materials" && kind !== "suppliers" && kind !== "assets") || !validId.test(id)) return new Response(null, { status: 404 });
  const supabase = await createClient();
  const { data: claims } = await supabase.auth.getClaims();
  if (!claims?.claims?.sub) return new Response(null, { status: 401 });
  return readRecordPhoto(supabase, kind, id);
}
