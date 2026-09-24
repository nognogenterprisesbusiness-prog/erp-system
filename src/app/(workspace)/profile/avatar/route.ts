import { requireUser } from "@/lib/auth";
import { createClient } from "@/lib/supabase/server";

const validId = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

export async function GET(request: Request) {
  const user = await requireUser();
  const requestedId = new URL(request.url).searchParams.get("userId");
  if (requestedId && !validId.test(requestedId)) return new Response(null, { status: 404 });
  if (requestedId && requestedId !== user.userId && !user.canManage) return new Response(null, { status: 403 });
  const supabase = await createClient();
  const profile = requestedId && requestedId !== user.userId
    ? (await supabase.from("profiles").select("avatar_path").eq("id", requestedId).maybeSingle()).data
    : user.profile;
  if (!profile?.avatar_path) return new Response(null, { status: 404 });
  const { data, error } = await supabase.storage.from("erp-profile-photos").download(profile.avatar_path);
  if (error || !data) return new Response(null, { status: 404 });
  return new Response(data, { headers: { "Content-Type": "image/webp", "Cache-Control": "private, no-store", "X-Content-Type-Options": "nosniff" } });
}
