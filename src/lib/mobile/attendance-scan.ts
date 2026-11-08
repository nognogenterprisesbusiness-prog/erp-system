import "server-only";
import { attendanceScanInputSchema, attendanceScanListSchema, attendanceScanResultSchema, uuidSchema } from "@nognog/domain";
import type { SupabaseClient } from "@supabase/supabase-js";
import type { Database } from "@/types/database";
import { boundedBody, databaseError, MobileError } from "./http";

type Client = SupabaseClient<Database>;

// Database messages that are already written for the Foreman; anything else uses the shared mapping.
const scanMessages = [
  /^This is not a worker ID card$/,
  /^ID card not recognised$/,
  /^This ID card was replaced\. Use the worker's new card\.$/,
  /^.{1,170} is not an active employee$/,
  /^.{1,170} is not assigned to this site today$/,
  /^Attendance for .{1,170} is already recorded today$/,
];

export function attendanceScanError(error: { code?: string; message: string }): never {
  if (scanMessages.some((pattern) => pattern.test(error.message)))
    throw new MobileError(error.code === "23505" ? 409 : 422, `${error.message}.`.replace(/\.\.$/, "."));
  if (error.code === "42501") throw new MobileError(403, "Only the assigned Foreman can scan attendance for this site.");
  databaseError(error);
}

export async function readAttendanceScans(client: Client, request: Request) {
  const params = new URL(request.url).searchParams;
  const projectId = uuidSchema.safeParse(params.get("projectId")), siteId = uuidSchema.safeParse(params.get("siteId"));
  if (!projectId.success || !siteId.success) throw new MobileError(400, "Choose a project site.");
  const result = await client.rpc("get_attendance_scans", { p_project_id: projectId.data, p_site_id: siteId.data });
  if (result.error) attendanceScanError(result.error);
  return attendanceScanListSchema.parse({ items: result.data ?? [] });
}

export async function recordAttendanceScan(client: Client, request: Request) {
  if (!request.headers.get("content-type")?.startsWith("application/json")) throw new MobileError(415, "Send a JSON request.");
  let body: unknown;
  try {
    body = JSON.parse(new TextDecoder().decode(await boundedBody(request, 2048)));
  } catch {
    throw new MobileError(400, "The scan is invalid.");
  }
  const input = attendanceScanInputSchema.safeParse(body);
  if (!input.success) throw new MobileError(422, input.error.issues.some((issue) => issue.path[0] === "card") ? "This is not a worker ID card." : "Choose a project site, then scan again.");
  const result = await client.rpc("record_attendance_scan", {
    p_idempotency_key: input.data.idempotencyKey,
    p_project_id: input.data.projectId,
    p_site_id: input.data.siteId,
    p_card: input.data.card,
  });
  if (result.error) attendanceScanError(result.error);
  return attendanceScanResultSchema.parse(result.data);
}
