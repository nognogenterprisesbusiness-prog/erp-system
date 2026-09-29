"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { cancelMaterialRequestSchema, decideMaterialRequestSchema, dispatchRequestWithManifestSchema, receiveRequestWithInspectionSchema, submitMaterialRequestSchema } from "@nognog/domain";
import type { ActionResult } from "@nognog/domain";
import { requireUser } from "@/lib/auth";
import { createClient } from "@/lib/supabase/server";
import { executeSiteCommand } from "@/lib/mobile/commands";

export type RequestActionState = ActionResult<{ id: string }>;
const failure = (message: string, fieldErrors?: Record<string, string[]>): RequestActionState => ({ ok: false, message, fieldErrors });
const value = (form: FormData, key: string) => String(form.get(key) ?? "");

function requestError(error: { code?: string; message: string }): string {
  if (error.code === "42501") return "You do not have access to perform this request action.";
  if (error.code === "23505") return "This form was already used for a different request. Refresh and try again.";
  if (error.message.includes("already decided")) return "This request has already been decided. Refresh to see its current status.";
  if (error.message.includes("warehouse is unavailable")) return "The project, site, or warehouse is no longer available.";
  if (error.message.includes("insufficient available stock to reserve")) return "The warehouse cannot reserve the approved quantity. Reduce it or replenish stock, then try again.";
  return "The material request could not be saved. Review its details and try again.";
}

export async function cancelMaterialRequestAction(_: RequestActionState, form: FormData): Promise<RequestActionState> {
  await requireUser();
  const parsed = cancelMaterialRequestSchema.safeParse({
    idempotencyKey: value(form, "idempotencyKey"), requestId: value(form, "requestId"), reason: value(form, "reason"),
  });
  if (!parsed.success) return failure("Enter a cancellation reason of 3 to 500 characters.", parsed.error.flatten().fieldErrors);
  const input = parsed.data;
  const supabase = await createClient();
  const { data, error } = await supabase.rpc("cancel_material_request", {
    p_idempotency_key: input.idempotencyKey, p_request_id: input.requestId, p_reason: input.reason,
  });
  if (error) {
    if (error.code === "42501") return failure("Only the requester or an administrator can cancel this request.");
    if (error.message.includes("dispatched")) return failure("This request already has a dispatch and cannot be cancelled.");
    return failure(requestError(error));
  }
  revalidatePath("/requests");
  revalidatePath("/inventory");
  revalidatePath(`/requests/${data}`);
  redirect(`/requests/${data}?cancelled=1`);
}

export async function submitMaterialRequestAction(_: RequestActionState, form: FormData): Promise<RequestActionState> {
  const user = await requireUser();
  if (user.canManage || !user.roles.some((role) => ["engineer", "foreman"].includes(role)))
    return failure("You do not have permission to request materials.");
  const rawLines = value(form, "lines");
  if (rawLines.length > 8_000) return failure("Too many request lines.");
  let lines: unknown;
  try { lines = JSON.parse(rawLines); } catch { return failure("Review the requested materials."); }
  const parsed = submitMaterialRequestSchema.safeParse({
    idempotencyKey: value(form, "idempotencyKey"), projectId: value(form, "projectId"),
    siteId: value(form, "siteId"), warehouseId: value(form, "warehouseId"),
    requiredDate: value(form, "requiredDate"), purpose: value(form, "purpose"), lines,
  });
  if (!parsed.success) return failure("Review the material request details.", parsed.error.flatten().fieldErrors);
  const input = parsed.data;
  const supabase = await createClient();
  let data: string | undefined;
  try { data = (await executeSiteCommand(supabase, { action: "request-materials", input })).id; }
  catch (cause) { return failure(cause instanceof Error ? cause.message : "The request could not be saved."); }
  revalidatePath("/requests");
  redirect(`/requests/${data}`);
}

export async function decideMaterialRequestAction(_: RequestActionState, form: FormData): Promise<RequestActionState> {
  const user = await requireUser();
  if (!user.canManage && !user.roles.includes("engineer")) return failure("Assigned engineer or admin approval is required.");
  const rawDecisions = value(form, "decisions");
  if (rawDecisions.length > 8_000) return failure("Too many approval lines.");
  let decisions: unknown;
  try { decisions = JSON.parse(rawDecisions); } catch { return failure("Review approved quantities."); }
  const parsed = decideMaterialRequestSchema.safeParse({
    idempotencyKey: value(form, "idempotencyKey"), requestId: value(form, "requestId"),
    decisions, reason: value(form, "reason"),
  });
  if (!parsed.success) return failure("Review the approval details.", parsed.error.flatten().fieldErrors);
  const input = parsed.data;
  const supabase = await createClient();
  let data: string | undefined;
  try { data = (await executeSiteCommand(supabase, { action: "decide-materials", input })).id; }
  catch (cause) { return failure(cause instanceof Error ? cause.message : "The decision could not be saved."); }
  revalidatePath("/requests");
  revalidatePath(`/requests/${data}`);
  revalidatePath("/inventory");
  redirect(`/requests/${data}?decided=1`);
}

function fulfillmentError(error: { code?: string; message: string }): string {
  if (error.code === "42501") return "You are not authorized for this warehouse or project.";
  if (error.code === "23505") return "This form was already used for another movement. Refresh before trying again.";
  if (error.message.includes("insufficient available stock")) return "The warehouse does not have enough available stock.";
  if (error.message.includes("reserved stock is unavailable") || error.message.includes("reserved quantity")) return "The reserved quantity is no longer available. Refresh the request.";
  if (error.message.includes("exceeds remaining approved")) return "The quantity exceeds the approved amount still awaiting dispatch.";
  if (error.message.includes("exceeds remaining in-transit")) return "The quantity exceeds what is still in transit.";
  if (error.message.includes("inactive")) return "The project, site, or warehouse is no longer active.";
  return "The movement could not be posted. Refresh the page and review the quantities.";
}

export async function dispatchRequestLineAction(_: RequestActionState, form: FormData): Promise<RequestActionState> {
  const user = await requireUser();
  if (!user.canOperateInventory) return failure("Only assigned warehouse staff or administrators can dispatch stock.");
  const parsed = dispatchRequestWithManifestSchema.safeParse({
    idempotencyKey: value(form, "idempotencyKey"), requestLineId: value(form, "requestLineId"),
    quantity: value(form, "quantity"), transactionDate: value(form, "transactionDate"), remarks: value(form, "remarks"),
    vehicleAssetId: value(form, "vehicleAssetId"), vehicleLabel: value(form, "vehicleLabel"),
    driverName: value(form, "driverName"), deliveryReference: value(form, "deliveryReference"),
  });
  if (!parsed.success) return failure("Review the dispatch details.", parsed.error.flatten().fieldErrors);
  const input = parsed.data;
  const supabase = await createClient();
  const { error } = await supabase.rpc("dispatch_approved_request_line_with_manifest", {
    p_idempotency_key: input.idempotencyKey, p_request_line_id: input.requestLineId,
    p_quantity: input.quantity, p_transaction_date: input.transactionDate, p_remarks: input.remarks || null,
    p_vehicle_asset_id: input.vehicleAssetId || null, p_vehicle_label: input.vehicleLabel,
    p_driver_name: input.driverName, p_delivery_reference: input.deliveryReference,
  });
  if (error) return failure(fulfillmentError(error));
  revalidatePath("/requests"); revalidatePath("/requests/[id]", "page"); revalidatePath("/inventory/transfers"); revalidatePath("/inventory");
  return { ok: true, data: { id: input.requestLineId } };
}

export async function receiveRequestTransferAction(_: RequestActionState, form: FormData): Promise<RequestActionState> {
  const user = await requireUser();
  if (!user.canManage && !user.roles.some((role) => ["engineer", "foreman"].includes(role)))
    return failure("Only assigned project staff can confirm receipt.");
  const parsed = receiveRequestWithInspectionSchema.safeParse({
    idempotencyKey: value(form, "idempotencyKey"), transferItemId: value(form, "transferItemId"), requestId: value(form, "requestId"),
    quantity: value(form, "quantity"), transactionDate: value(form, "transactionDate"), remarks: value(form, "remarks"),
    condition: value(form, "condition"), qualityNote: value(form, "qualityNote"),
  });
  if (!parsed.success) return failure("Review the receipt details.", parsed.error.flatten().fieldErrors);
  const input = parsed.data;
  const supabase = await createClient();
  const { error } = await supabase.rpc("receive_request_transfer_with_inspection", {
    p_idempotency_key: input.idempotencyKey, p_transfer_item_id: input.transferItemId,
    p_quantity: input.quantity, p_transaction_date: input.transactionDate, p_remarks: input.remarks || null,
    p_condition: input.condition, p_quality_note: input.qualityNote || null,
  });
  if (error) return failure(fulfillmentError(error));
  revalidatePath("/requests"); revalidatePath(`/requests/${input.requestId}`); revalidatePath("/inventory/transfers"); revalidatePath("/inventory");
  return { ok: true, data: { id: input.requestId } };
}
