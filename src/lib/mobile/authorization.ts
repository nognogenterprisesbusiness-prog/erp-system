import { mobileResponseSchemas } from "@nognog/domain";
import type { MobileCommand } from "@nognog/domain";
import type { SupabaseClient } from "@supabase/supabase-js";
import type { Database } from "@/types/database";
import { MobileError, databaseError } from "./http";

type Client = SupabaseClient<Database>;
export async function requireMobileSite(
  client: Client,
  projectId: string,
  siteId: string,
  role?: "foreman" | "engineer",
) {
  const result = await client.rpc("get_mobile_projects", { p_id: projectId });
  if (result.error) databaseError(result.error);
  const project = result.data?.[0]?.record;
  const parsed = mobileResponseSchemas.project.shape.project.safeParse(project);
  const permission = parsed.success
    ? parsed.data.site_permissions.find((site) => site.id === siteId)
    : undefined;
  if (
    !permission ||
    (role === "foreman" && !permission.can_record) ||
    (role === "engineer" && !permission.can_review)
  )
    throw new MobileError(
      403,
      "You do not have permission for this action or site.",
    );
}

export async function authorizeMobileCommand(
  client: Client,
  command: MobileCommand,
) {
  switch (command.action) {
    case "request-materials":
    case "record-attendance":
      return requireMobileSite(
        client,
        command.input.projectId,
        command.input.siteId,
        command.action === "record-attendance" ? "foreman" : undefined,
      );
    case "request-equipment":
      return requireMobileSite(
        client,
        command.input.request.projectId,
        command.input.request.siteId,
      );
    case "decide-materials":
    case "receive-materials":
    case "cancel-materials": {
      const row = await client
        .from("material_requests")
        .select("project_id,project_site_id")
        .eq("id", command.input.requestId)
        .maybeSingle();
      if (row.error) databaseError(row.error);
      if (!row.data)
        throw new MobileError(404, "Request is no longer available.");
      return requireMobileSite(
        client,
        row.data.project_id,
        row.data.project_site_id,
        command.action === "decide-materials" ? "engineer" : undefined,
      );
    }
    case "consume-materials": {
      const row = await client
        .from("inventory_locations")
        .select("project_site_id")
        .eq("id", command.input.siteLocationId)
        .maybeSingle();
      if (row.error) databaseError(row.error);
      if (!row.data?.project_site_id)
        throw new MobileError(404, "Site is no longer available.");
      return requireMobileSite(
        client,
        command.input.projectId,
        row.data.project_site_id,
      );
    }
    case "record-equipment": {
      const asset = await client
        .from("assets")
        .select("current_location_id")
        .eq("id", command.input.assetId)
        .maybeSingle();
      if (asset.error) databaseError(asset.error);
      if (!asset.data?.current_location_id)
        throw new MobileError(404, "Equipment is no longer assigned.");
      const location = await client
        .from("asset_locations")
        .select("inventory_location_id")
        .eq("id", asset.data.current_location_id)
        .maybeSingle();
      if (location.error) databaseError(location.error);
      if (!location.data?.inventory_location_id)
        throw new MobileError(404, "Equipment site is unavailable.");
      const site = await client
        .from("inventory_locations")
        .select("project_site_id")
        .eq("id", location.data.inventory_location_id)
        .maybeSingle();
      if (site.error) databaseError(site.error);
      if (!site.data?.project_site_id)
        throw new MobileError(403, "Equipment must be assigned to your site.");
      return requireMobileSite(
        client,
        command.input.projectId,
        site.data.project_site_id,
        "foreman",
      );
    }
    case "save-report":
      return requireMobileSite(
        client,
        command.input.projectId,
        command.input.projectSiteId,
      );
    case "review-report":
    case "record-progress":
    case "correct-report":
    case "link-resource": {
      const row = await client
        .from("daily_reports")
        .select("project_id,project_site_id")
        .eq("id", command.input.reportId)
        .maybeSingle();
      if (row.error) databaseError(row.error);
      if (!row.data)
        throw new MobileError(404, "Report is no longer available.");
      return requireMobileSite(
        client,
        row.data.project_id,
        row.data.project_site_id,
        command.action === "review-report" ||
          command.action === "record-progress"
          ? "engineer"
          : undefined,
      );
    }
    case "read-notification":
    case "read-all-notifications":
      return;
  }
}
