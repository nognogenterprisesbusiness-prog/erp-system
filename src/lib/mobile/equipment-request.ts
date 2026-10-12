import type { SupabaseClient } from "@supabase/supabase-js";
import { equipmentRequestInputSchema, idempotentEquipmentRequestSchema } from "@nognog/domain";
import type { Database } from "@/types/database";
import { databaseError } from "./http";

export async function submitSiteEquipmentRequest(
  client: SupabaseClient<Database>,
  raw: unknown,
  key?: string,
) {
  if (key) {
    const parsed = idempotentEquipmentRequestSchema.parse({ idempotencyKey: key, request: raw }).request;
    if (!parsed.neededOn && !parsed.expectedReturnOn) {
      const result = await client.rpc("submit_mobile_equipment_request", { p_key: key, p_asset_id: parsed.assetId, p_project_id: parsed.projectId, p_site_id: parsed.siteId, p_purpose: parsed.purpose });
      if (result.error) databaseError(result.error);
      return result.data!;
    }
  }
  const input = equipmentRequestInputSchema.parse(raw);
  const result = key
    ? await client.rpc("submit_equipment_request_once", {
        p_key: key,
        p_asset_id: input.assetId,
        p_project_id: input.projectId,
        p_site_id: input.siteId,
        p_needed_on: input.neededOn,
        p_expected_return_on: input.expectedReturnOn,
        p_purpose: input.purpose,
      })
    : await client.rpc("submit_equipment_request", {
        p_asset_id: input.assetId,
        p_project_id: input.projectId,
        p_project_site_id: input.siteId,
        p_needed_on: input.neededOn,
        p_expected_return_on: input.expectedReturnOn,
        p_purpose: input.purpose,
      });
  if (result.error) databaseError(result.error);
  return result.data!;
}
