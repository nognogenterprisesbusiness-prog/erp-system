import { requireUser } from "@/lib/auth";
import { createClient } from "@/lib/supabase/server";

const validId = /^[0-9a-f-]{36}$/i;

function avatarFallback(name: string) {
  const initials = name.trim().split(/\s+/).filter(Boolean).slice(0, 2).map((part) => part[0]).join("").toUpperCase() || "?";
  const escapedInitials = initials.replaceAll("&", "&amp;").replaceAll("<", "&lt;").replaceAll(">", "&gt;");
  const image = `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 96 96"><rect width="96" height="96" rx="48" fill="#ecfeff"/><text x="48" y="52" dominant-baseline="middle" text-anchor="middle" font-family="Arial,sans-serif" font-size="32" font-weight="600" fill="#0e7490">${escapedInitials}</text></svg>`;
  return new Response(image, { headers: { "Content-Type": "image/svg+xml; charset=utf-8", "Cache-Control": "private, no-store", "X-Content-Type-Options": "nosniff" } });
}

export async function GET(request: Request) {
  const user = await requireUser();
  const requestedId = new URL(request.url).searchParams.get("userId");
  if (requestedId && !validId.test(requestedId)) return new Response(null, { status: 404 });
  if (requestedId && requestedId !== user.userId && !user.canManage) return new Response(null, { status: 403 });

  const supabase = await createClient();
  const profile = requestedId && requestedId !== user.userId
    ? (await supabase.from("profiles").select("avatar_path,full_name").eq("id", requestedId).maybeSingle()).data
    : user.profile;
  if (!profile) return avatarFallback("?");
  if (!profile.avatar_path) return avatarFallback(profile.full_name);

  const { data, error } = await supabase.storage.from("erp-profile-photos").download(profile.avatar_path);
  if (error || !data) return avatarFallback(profile.full_name);
  return new Response(data, { headers: { "Content-Type": "image/webp", "Cache-Control": "private, no-store", "X-Content-Type-Options": "nosniff" } });
}
