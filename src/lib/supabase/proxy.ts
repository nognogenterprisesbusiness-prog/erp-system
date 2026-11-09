import { createServerClient } from "@supabase/ssr";
import { NextResponse, type NextRequest } from "next/server";
import type { Database } from "@/types/database";
import { getSupabaseEnv } from "./env";
import { workspaceReturnPath } from "@/lib/auth-return-path";

export async function updateSession(request: NextRequest) {
  let response = NextResponse.next({ request });
  const { url, publishableKey } = getSupabaseEnv();
  const supabase = createServerClient<Database>(url, publishableKey, {
    cookies: {
      getAll: () => request.cookies.getAll(),
      setAll(cookiesToSet) {
        cookiesToSet.forEach(({ name, value }) => request.cookies.set(name, value));
        response = NextResponse.next({ request });
        cookiesToSet.forEach(({ name, value, options }) => response.cookies.set(name, value, options));
      },
    },
  });
  const { data } = await supabase.auth.getClaims();
  const returnPath = workspaceReturnPath(request.nextUrl.pathname + request.nextUrl.search);
  if (!data?.claims && returnPath) {
    const loginUrl = request.nextUrl.clone();
    loginUrl.pathname = "/";
    loginUrl.search = "";
    loginUrl.searchParams.set("next", returnPath);
    return NextResponse.redirect(loginUrl);
  }
  if (data?.claims && request.nextUrl.pathname === "/") {
    const next = workspaceReturnPath(request.nextUrl.searchParams.get("next")) ?? "/dashboard";
    return NextResponse.redirect(new URL(next, request.url));
  }
  return response;
}
