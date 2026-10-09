import { createClient } from "@supabase/supabase-js";
import { mobileAccess, mobileRoles } from "@nognog/domain";
import { getSupabaseEnv } from "@/lib/supabase/env";
import type { Database } from "@/types/database";
import type { MobileCompatibility } from "@nognog/domain";
import { inspectMobileBuild, inspectMobileProtocol, mobileCompatibility } from "./compatibility";

export class MobileError extends Error {
  constructor(
    public status: number,
    message: string,
    public fieldErrors?: Record<string, string[]>,
    public compatibility?: MobileCompatibility,
  ) {
    super(message);
  }
}
export function bearerToken(header: string | null) {
  const match = /^Bearer ([A-Za-z0-9._~-]+)$/.exec(header ?? "");
  if (!match || match[1].length > 8192)
    throw new MobileError(401, "Please sign in again.");
  return match[1];
}
function tokenSubject(token: string) {
  try {
    const payload: unknown = JSON.parse(
      Buffer.from(token.split(".")[1] ?? "", "base64url").toString("utf8"),
    );
    if (
      payload &&
      typeof payload === "object" &&
      "sub" in payload &&
      typeof payload.sub === "string" &&
      /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(payload.sub)
    )
      return payload.sub;
  } catch {}
  throw new MobileError(401, "Please sign in again.");
}
export function assertMobileCompatibility(request: Request, compatibility = mobileCompatibility()) {
  const protocol = inspectMobileProtocol(request.headers.get("x-nognog-mobile-protocol"), compatibility);
  if (protocol === "invalid") throw new MobileError(400, "The mobile compatibility header is invalid.");
  if (protocol === "update_required") throw new MobileError(426, "Please update Nognog to continue safely with this ERP.", undefined, compatibility);
  if (protocol === "server_outdated") throw new MobileError(503, "The ERP needs an update to support this app. Contact your administrator.");
  const build = inspectMobileBuild(request.headers.get("x-nognog-mobile-platform"), request.headers.get("x-nognog-mobile-build"), compatibility);
  if (build === "invalid") throw new MobileError(400, "The mobile build headers are invalid.");
  if (build === "update_required") throw new MobileError(426, "A newer Nognog app is required to continue.", undefined, compatibility);
}
export async function mobileContext(request: Request, write: boolean) {
  const token = bearerToken(request.headers.get("authorization"));
  assertMobileCompatibility(request);
  const env = getSupabaseEnv();
  const client = createClient<Database>(env.url, env.publishableKey, {
    global: { headers: { Authorization: `Bearer ${token}` } },
    auth: {
      persistSession: false,
      autoRefreshToken: false,
      detectSessionInUrl: false,
    },
  });
  // The unverified subject only scopes the parallel reads below. PostgREST
  // verifies the same bearer token for each of them, and getClaims must confirm
  // it. The project signs with asymmetric keys, so getClaims verifies locally
  // against the cached JWKS instead of a round trip to Supabase Auth.
  const subject = tokenSubject(token);
  const [{ data: auth, error }, profile, roleRows, allowed] = await Promise.all([
    client.auth.getClaims(token),
    client
      .from("profiles")
      .select("id,full_name,email,avatar_path,updated_at,is_active,onboarding_required")
      .eq("id", subject)
      .maybeSingle(),
    client.from("user_roles").select("role").eq("user_id", subject),
    client.rpc("guard_mobile_api", { p_write: write }),
  ]);
  if (error || !auth || auth.claims.sub !== subject)
    throw new MobileError(401, "Please sign in again.");
  if (profile.error || roleRows.error)
    throw new MobileError(
      503,
      "Account access could not be checked. Please retry.",
    );
  const roles = (roleRows.data ?? []).map((row) => row.role);
  if (
    !profile.data ||
    !mobileAccess(
      roles,
      profile.data.is_active,
      profile.data.onboarding_required,
    )
  )
    throw new MobileError(
      403,
      "This app is for active Foreman and Engineer accounts. Complete account setup in the web ERP if required.",
    );
  if (allowed.error)
    throw new MobileError(
      503,
      "The mobile database setup is unavailable. Contact your administrator.",
    );
  if (!allowed.data)
    throw new MobileError(429, "Too many requests. Wait a minute and retry.");
  return {
    client,
    user: {
      ...profile.data,
      roles: roles.filter(
        (role): role is (typeof mobileRoles)[number] =>
          role === "foreman" || role === "engineer",
      ),
    },
  };
}
export async function boundedBody(
  request: Request,
  limit: number,
): Promise<Uint8Array> {
  const length = Number(request.headers.get("content-length") ?? 0);
  if (length > limit) throw new MobileError(413, "The upload is too large.");
  const reader = request.body?.getReader();
  if (!reader) throw new MobileError(400, "Request content is missing.");
  const chunks: Uint8Array[] = [];
  let size = 0;
  try {
    while (true) {
      const result = await reader.read();
      if (result.done) break;
      size += result.value.length;
      if (size > limit) {
        await reader.cancel();
        throw new MobileError(413, "The upload is too large.");
      }
      chunks.push(result.value);
    }
  } finally {
    reader.releaseLock();
  }
  const body = new Uint8Array(size);
  let offset = 0;
  for (const chunk of chunks) {
    body.set(chunk, offset);
    offset += chunk.length;
  }
  return body;
}
export function databaseError(error: {
  code?: string;
  message: string;
}): never {
  if (error.code === "PGRST202")
    throw new MobileError(
      503,
      "This operation is not enabled in the ERP database yet. Contact your administrator to apply the required database update.",
    );
  if (error.code === "42501")
    throw new MobileError(
      403,
      "You do not have permission for this action or project.",
    );
  if (error.code === "23505" || error.code === "55000")
    throw new MobileError(
      409,
      "This record changed or was already posted. Refresh before retrying.",
    );
  if (
    error.code === "23502" &&
    /column \"(business_name|category_id|contact_person|email_address|city|province|payment_terms)\".*suppliers/i.test(error.message)
  )
    throw new MobileError(
      503,
      "The supplier database needs the latest purchasing update. Ask your administrator to apply the pending ERP database migration, then retry.",
    );
  const messages: [string, string][] = [
    [
      "insufficient",
      "There is not enough available stock. Refresh and review the quantity.",
    ],
    [
      "exceeds remaining",
      "The quantity exceeds the delivery still awaiting receipt.",
    ],
    [
      "rate",
      "An administrator must configure a valid labor or equipment rate for this date.",
    ],
    ["24", "Recorded hours cannot exceed 24 hours in one day."],
    [
      "approved",
      "This action requires an approved record. Refresh its status.",
    ],
    ["required", "Review the required fields before submitting."],
    ["receipt photo", "Add or retake the receipt photo before submitting."],
    ["receipt date cannot be in the future", "The receipt date is later than today's ERP date. Check the date and try again."],
    ["invalid site purchase line", "The ERP could not read one of the item lines. Re-select the item and enter its quantity and price, then retry."],
    ["invalid site purchase", "Review the receipt details, payment method, and at least one valid item."],
    ["store name, address and contact", "Enter the new store's name, address, and valid contact number."],
    ["unit price", "Enter a price greater than zero with up to two decimal places for every item."],
    ["materials that are already in inventory", "One selected material is no longer active or its unit is unavailable. Refresh the purchase choices and try again."],
    ["quantity exceeds the unit precision", "Enter a quantity using only the decimal places allowed for that material's unit."],
    ["unit not found or inactive", "This material's unit is inactive. Refresh the purchase choices and ask Admin to check the material setup."],
    ["quantity must be positive", "Enter a quantity greater than zero for every item."],
    ["each material once", "Choose each material only once in the purchase."],
    ["not active", "The project site or store is no longer active. Refresh the purchase choices and try again."],
    [
      "inactive",
      "The project, site, employee or equipment is no longer active.",
    ],
    ["unavailable", "This project, site or item is no longer available."],
    ["not assigned", "The worker is not assigned to this site on that date."],
  ];
  for (const [match, message] of messages)
    if (error.message.toLowerCase().includes(match))
      throw new MobileError(422, message);
  const errorReference = `DB-${error.code ?? "UNKNOWN"}`;
  console.error("Mobile database operation failed", { errorReference });
  throw new MobileError(
    error.code === "22023" ? 422 : 503,
    `The operation could not be completed. Review the details and retry. Error reference: ${errorReference}.`,
  );
}
export function mobileFailure(error: unknown) {
  const known = error instanceof MobileError;
  return Response.json(
    {
      ok: false,
      message: known
        ? error.message
        : "The operation could not be completed. Please retry.",
      ...(known && error.fieldErrors ? { fieldErrors: error.fieldErrors } : {}),
      ...(known && error.status === 426 && error.compatibility ? { code: "APP_UPDATE_REQUIRED", compatibility: error.compatibility } : {}),
    },
    {
      status: known ? error.status : 500,
      headers: { "Cache-Control": "private, no-store" },
    },
  );
}
