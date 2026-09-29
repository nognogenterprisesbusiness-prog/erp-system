import type { SupabaseClient } from "@supabase/supabase-js";
import { mobileCommandSchema } from "@nognog/domain";
import type { MobileCommandResult } from "@nognog/domain";
import type { Database } from "@/types/database";
import { databaseError, MobileError } from "./http";
import { submitSiteEquipmentRequest } from "./equipment-request";

export async function executeSiteCommand(
  client: SupabaseClient<Database>,
  raw: unknown,
): Promise<MobileCommandResult> {
  const parsed = mobileCommandSchema.safeParse(raw);
  if (!parsed.success)
    throw new MobileError(
      422,
      "Review the highlighted fields.",
      parsed.error.flatten().fieldErrors,
    );
  const command = parsed.data;
  switch (command.action) {
    case "report-missing-material": {
      const i = command.input;
      const r = await client.rpc("submit_material_sourcing_request", {
        p_key: i.key, p_project_id: i.projectId, p_site_id: i.siteId,
        p_warehouse_id: i.warehouseId, p_material_name: i.name,
        p_unit_name: i.unit, p_quantity: Number(i.quantity),
        p_needed_on: i.neededOn, p_reason: i.reason,
      });
      if (r.error) databaseError(r.error);
      return { id: r.data!, message: "Missing material sent to Admin for review." };
    }
    case "request-materials": {
      const i = command.input;
      const r = await client.rpc("submit_material_request", {
        p_idempotency_key: i.idempotencyKey,
        p_project_id: i.projectId,
        p_project_site_id: i.siteId,
        p_source_warehouse_id: i.warehouseId,
        p_required_date: i.requiredDate,
        p_purpose: i.purpose,
        p_lines: i.lines,
      });
      if (r.error) databaseError(r.error);
      return { id: r.data!, message: "Material request submitted." };
    }
    case "decide-materials": {
      const i = command.input;
      const r = await client.rpc("decide_material_request", {
        p_idempotency_key: i.idempotencyKey,
        p_request_id: i.requestId,
        p_decisions: i.decisions,
        p_reason: i.reason || null,
      });
      if (r.error) databaseError(r.error);
      return { id: r.data!, message: "Decision saved." };
    }
    case "receive-materials": {
      const i = command.input;
      const dispatch = await client
        .from("material_request_dispatches")
        .select("request_line_id")
        .eq("transfer_item_id", i.transferItemId)
        .maybeSingle();
      if (dispatch.error) databaseError(dispatch.error);
      if (!dispatch.data)
        throw new MobileError(404, "Delivery is no longer available.");
      const line = await client
        .from("material_request_lines")
        .select("id")
        .eq("id", dispatch.data.request_line_id)
        .eq("request_id", i.requestId)
        .maybeSingle();
      if (line.error) databaseError(line.error);
      if (!line.data)
        throw new MobileError(403, "Delivery does not belong to this request.");
      const r = await client.rpc("receive_request_transfer_with_inspection", {
        p_idempotency_key: i.idempotencyKey,
        p_transfer_item_id: i.transferItemId,
        p_quantity: i.quantity,
        p_transaction_date: i.transactionDate,
        p_remarks: i.remarks || null,
        p_condition: i.condition,
        p_quality_note: i.qualityNote || null,
      });
      if (r.error) databaseError(r.error);
      return { id: r.data!, message: "Materials received." };
    }
    case "cancel-materials": {
      const i = command.input;
      const r = await client.rpc("cancel_material_request", {
        p_idempotency_key: i.idempotencyKey,
        p_request_id: i.requestId,
        p_reason: i.reason,
      });
      if (r.error) databaseError(r.error);
      return { id: r.data!, message: "Request cancelled." };
    }
    case "consume-materials": {
      const i = command.input;
      const r = await client.rpc("consume_site_material", {
        p_idempotency_key: i.idempotencyKey,
        p_project_id: i.projectId,
        p_material_id: i.materialId,
        p_site_location_id: i.siteLocationId,
        p_quantity: i.quantity,
        p_unit_id: i.unitId,
        p_reference_document: i.referenceNumber,
        p_transaction_date: i.transactionDate,
        p_remarks: i.remarks || null,
      });
      if (r.error) databaseError(r.error);
      return { id: r.data!, message: "Material usage recorded." };
    }
    case "request-equipment": {
      const id = await submitSiteEquipmentRequest(
        client,
        command.input.request,
        command.input.idempotencyKey,
      );
      return { id, message: "Equipment request submitted." };
    }
    case "record-equipment": {
      const i = command.input;
      const r = await client.rpc("post_project_equipment_usage_with_photos", {
        p_idempotency_key: i.idempotencyKey,
        p_project_id: i.projectId,
        p_asset_id: i.assetId,
        p_use_date: i.useDate,
        p_hours: i.hours,
        p_work_note: i.workNote,
      });
      if (r.error) databaseError(r.error);
      return { id: r.data!, message: "Equipment hours recorded." };
    }
    case "record-attendance": {
      const i = command.input;
      const r = await client.rpc("post_project_attendance_batch", {
        p_project_id: i.projectId,
        p_site_id: i.siteId,
        p_work_date: i.workDate,
        p_entries: i.entries,
      });
      if (r.error) databaseError(r.error);
      return { ids: r.data!, message: "Attendance recorded." };
    }
    case "save-report": {
      const i = command.input;
      const r = await client.rpc("save_daily_report", {
        p_id: i.id,
        p_project_id: i.projectId,
        p_project_site_id: i.projectSiteId,
        p_report_date: i.reportDate,
        p_weather_conditions: i.weatherConditions,
        p_work_description: i.workDescription,
        p_accomplishments: i.accomplishments,
        p_issues_encountered: i.issuesEncountered,
        p_site_observations: i.siteObservations,
        p_general_remarks: i.generalRemarks,
        p_submit: i.intent === "submit",
      });
      if (r.error) databaseError(r.error);
      return {
        id: r.data!,
        message: i.intent === "submit" ? "Report submitted." : "Draft saved.",
      };
    }
    case "review-report": {
      const i = command.input;
      const r = await client.rpc("review_daily_report", {
        p_report_id: i.reportId,
        p_action: i.action,
        p_note: i.note,
      });
      if (r.error) databaseError(r.error);
      return { id: r.data!, message: "Report review saved." };
    }
    case "correct-report": {
      const r = await client.rpc("start_daily_report_correction", {
        p_report_id: command.input.reportId,
      });
      if (r.error) databaseError(r.error);
      return { id: r.data!, message: "Report reopened for correction." };
    }
    case "record-progress": {
      const i = command.input;
      const r = await client.rpc("record_project_progress", {
        p_report_id: i.reportId,
        p_percent: i.percent,
        p_summary: i.summary,
      });
      if (r.error) databaseError(r.error);
      return { id: r.data!, message: "Project progress recorded." };
    }
    case "link-resource": {
      const i = command.input;
      const r = await client.rpc(
        i.detach
          ? "detach_daily_report_resource"
          : "attach_daily_report_resource",
        {
          p_report_id: i.reportId,
          p_kind: i.kind,
          p_resource_id: i.resourceId,
        },
      );
      if (r.error) databaseError(r.error);
      return {
        message: i.detach
          ? "Activity removed from report."
          : "Activity attached to report.",
      };
    }
    case "read-notification": {
      const r = command.input.read
        ? await client.rpc("mark_notification_read", {
            p_notification_id: command.input.id,
          })
        : await client.rpc("mark_mobile_notification_unread", {
            p_id: command.input.id,
          });
      if (r.error) databaseError(r.error);
      if (!r.data)
        throw new MobileError(404, "Notification is no longer available.");
      return { message: "Notification updated." };
    }
    case "read-all-notifications": {
      const r = await client.rpc(
        command.input.read
          ? "mark_all_notifications_read"
          : "mark_all_notifications_unread",
      );
      if (r.error) databaseError(r.error);
      return { message: "Notifications updated." };
    }
  }
}
