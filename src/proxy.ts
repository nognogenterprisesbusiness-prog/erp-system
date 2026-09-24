import type { NextRequest } from "next/server";
import { NextResponse } from "next/server";

import { updateSession } from "@/lib/supabase/proxy";

function secureResponse(response: NextResponse): NextResponse {
  response.headers.set("X-Content-Type-Options", "nosniff");
  response.headers.set("X-Frame-Options", "DENY");
  response.headers.set("Referrer-Policy", "strict-origin-when-cross-origin");
  response.headers.set("Permissions-Policy", "geolocation=(), microphone=(), payment=()");
  return response;
}

export async function proxy(request: NextRequest) {
  const pathname = request.nextUrl.pathname;
  if (pathname === "/demo" || pathname.startsWith("/demo/") || pathname === "/api/locations" && (process.env.APP_MODE === "local-demo" || process.env.ENABLE_LOCAL_DEMO === "true")) {
    const response = NextResponse.next({ request });
    const developmentScriptPolicy = process.env.NODE_ENV === "development" ? " 'unsafe-eval'" : "";
    const connectionPolicy = process.env.NODE_ENV === "development" ? "connect-src 'self' ws: wss:" : "connect-src 'self'";
    response.headers.set("Content-Security-Policy", `default-src 'self'; ${connectionPolicy}; form-action 'self'; base-uri 'none'; img-src 'self' data: blob:; style-src 'self' 'unsafe-inline'; font-src 'self'; script-src 'self' 'unsafe-inline'${developmentScriptPolicy}; object-src 'none'; frame-src 'none'; frame-ancestors 'none'`);
    return secureResponse(response);
  }
  if (process.env.APP_MODE === "local-demo") {
    return secureResponse(NextResponse.redirect(new URL("/demo", request.url)));
  }
  const response = await updateSession(request);
  response.headers.set("Content-Security-Policy", "base-uri 'self'; object-src 'none'; frame-ancestors 'none'");
  return secureResponse(response);
}

export const config = { matcher: ["/((?!_next/static|_next/image|favicon.ico|.*\\.(?:svg|png|jpg|jpeg|gif|webp)$).*)"] };
