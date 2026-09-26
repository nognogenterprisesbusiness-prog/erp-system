"use server";
import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { legacyTransitValueInputSchema, openingValueInputSchema, reversalInputSchema, siteConsumptionInputSchema, stockInInputSchema, stockOutInputSchema, transferInputSchema, transferReceiptInputSchema, transferVarianceInputSchema } from "@nognog/domain";
import type { ActionResult } from "@nognog/domain";
import { requireUser } from "@/lib/auth";
import { createClient } from "@/lib/supabase/server";

export type InventoryActionState = ActionResult<{ id: string }>;
const value = (form: FormData, key: string) => String(form.get(key) ?? "");
const failure = (message: string, fieldErrors?: Record<string, string[]>): InventoryActionState => ({ ok: false, message, fieldErrors });
function friendlyInventoryError(error: { code?: string; message: string }) {
  if (error.code === "42501") return "You are not authorized for this inventory location.";
  if (error.message.includes("insufficient available stock")) return "There is not enough available stock for this transaction.";
  if (error.message.includes("different unit")) return "The selected unit does not match the material's base unit.";
  if (error.message.includes("idempotency")) return "This transaction key has already been used.";
  if (error.message.includes("exceeds remaining")) return "The received quantity exceeds the amount still in transit.";
  if (error.message.includes("receive request-bound stock")) return "Confirm this delivery on its material request instead.";
  if (error.message.includes("approved request or administrator exception")) return "Site deliveries require an approved request. An administrator can post a documented exception.";
  if (error.message.includes("administrator exception reason")) return "Enter an administrator exception reason for direct site dispatch.";
  if (error.message.includes("request-bound movements")) return "Request-bound movements need a dedicated correction workflow.";
  if (error.message.includes("verified value") || error.message.includes("verified opening value")) return "An administrator must verify this stock's opening value before it can move.";
  if (error.message.includes("insufficient site stock")) return "There is not enough available stock at this project site.";
  if (error.message.includes("quantity and valuation do not reconcile")) return "Stock and valuation do not reconcile. Ask an administrator to investigate.";
  return "The inventory transaction could not be posted.";
}
async function requireOperator() { const user = await requireUser(); if (!user.canOperateInventory) throw new Error("Not authorized"); return user; }
const basePayload = (form: FormData) => ({ idempotencyKey: value(form, "idempotencyKey"), materialId: value(form, "materialId"), quantity: value(form, "quantity"), unitId: value(form, "unitId"), referenceNumber: value(form, "referenceNumber"), transactionDate: value(form, "transactionDate"), remarks: value(form, "remarks") });

export async function stockInAction(_: InventoryActionState, form: FormData): Promise<InventoryActionState> {
  const user = await requireUser();
  if (!user.canManage) return failure("An administrator must approve a costed stock receipt until purchase orders are available.");
  const parsed = stockInInputSchema.safeParse({ ...basePayload(form), destinationLocationId: value(form, "destinationLocationId"), totalCost: value(form, "totalCost") });
  if (!parsed.success) return failure("Review the stock-in details.", parsed.error.flatten().fieldErrors);
  const input = parsed.data; const supabase = await createClient();
  const { data, error } = await supabase.rpc("post_valued_stock_in", { p_idempotency_key: input.idempotencyKey, p_material_id: input.materialId, p_destination_location_id: input.destinationLocationId, p_quantity: input.quantity, p_unit_id: input.unitId, p_total_cost: input.totalCost, p_reference_document: input.referenceNumber, p_transaction_date: input.transactionDate, p_remarks: input.remarks || null });
  if (error) return failure(friendlyInventoryError(error));
  revalidatePath("/inventory"); revalidatePath("/inventory/transactions"); redirect(`/inventory/transactions?posted=${data}`);
}

export async function verifyOpeningValueAction(_: InventoryActionState, form: FormData): Promise<InventoryActionState> {
  const user = await requireUser();
  if (!user.canManage) return failure("Only an administrator can verify opening stock values.");
  const parsed = openingValueInputSchema.safeParse({
    idempotencyKey: value(form, "idempotencyKey"), materialId: value(form, "materialId"),
    locationId: value(form, "locationId"), quantity: value(form, "quantity"),
    totalValue: value(form, "totalValue"), reason: value(form, "reason"),
  });
  if (!parsed.success) return failure("Review the verified quantity and total value.", parsed.error.flatten().fieldErrors);
  const input = parsed.data;
  const supabase = await createClient();
  const { data, error } = await supabase.rpc("verify_opening_stock_value", {
    p_idempotency_key: input.idempotencyKey, p_material_id: input.materialId,
    p_location_id: input.locationId, p_quantity: input.quantity,
    p_total_value: input.totalValue, p_reason: input.reason,
  });
  if (error) return failure(friendlyInventoryError(error));
  revalidatePath("/inventory"); revalidatePath("/inventory/opening-values");
  redirect(`/inventory/opening-values?verified=${data}`);
}

export async function verifyLegacyTransitValueAction(_: InventoryActionState, form: FormData): Promise<InventoryActionState> {
  const user = await requireUser();
  if (!user.canManage) return failure("Only an administrator can verify historical in-transit values.");
  const parsed = legacyTransitValueInputSchema.safeParse({
    idempotencyKey: value(form, "idempotencyKey"), transferItemId: value(form, "transferItemId"),
    dispatchedTotalCost: value(form, "dispatchedTotalCost"), receivedTotalCost: value(form, "receivedTotalCost"),
    supportingReference: value(form, "supportingReference"), reason: value(form, "reason"),
  });
  if (!parsed.success) return failure("Review the historical transit values.", parsed.error.flatten().fieldErrors);
  const input = parsed.data;
  const supabase = await createClient();
  const { data, error } = await supabase.rpc("verify_legacy_transit_value", {
    p_idempotency_key: input.idempotencyKey, p_transfer_item_id: input.transferItemId,
    p_dispatched_total_cost: input.dispatchedTotalCost, p_received_total_cost: input.receivedTotalCost,
    p_supporting_reference: input.supportingReference, p_reason: input.reason,
  });
  if (error) return failure(friendlyInventoryError(error));
  revalidatePath("/inventory/opening-values"); revalidatePath("/inventory/transfers");
  redirect(`/inventory/opening-values?transit=${data}`);
}

export async function consumeSiteMaterialAction(_: InventoryActionState, form: FormData): Promise<InventoryActionState> {
  const user = await requireUser();
  if (!user.canManage && !user.roles.some((role) => ["engineer", "foreman"].includes(role)))
    return failure("Only assigned project staff can record site consumption.");
  const parsed = siteConsumptionInputSchema.safeParse({ ...basePayload(form),
    siteLocationId: value(form, "siteLocationId"), projectId: value(form, "projectId") });
  if (!parsed.success) return failure("Review the site consumption details.", parsed.error.flatten().fieldErrors);
  const input = parsed.data;
  const supabase = await createClient();
  const { data, error } = await supabase.rpc("consume_site_material", {
    p_idempotency_key: input.idempotencyKey, p_material_id: input.materialId,
    p_site_location_id: input.siteLocationId, p_project_id: input.projectId,
    p_quantity: input.quantity, p_unit_id: input.unitId,
    p_reference_document: input.referenceNumber, p_transaction_date: input.transactionDate,
    p_remarks: input.remarks || null,
  });
  if (error) return failure(friendlyInventoryError(error));
  revalidatePath("/inventory"); revalidatePath("/inventory/transactions"); revalidatePath(`/projects/${input.projectId}`);
  redirect(`/inventory/transactions?posted=${data}`);
}

export async function approveTransferVarianceAction(_: InventoryActionState, form: FormData): Promise<InventoryActionState> {
  const user = await requireUser();
  if (!user.canManage) return failure("Only an administrator can approve an in-transit variance.");
  const parsed = transferVarianceInputSchema.safeParse({
    idempotencyKey: value(form, "idempotencyKey"), transferItemId: value(form, "transferItemId"),
    quantity: value(form, "quantity"), reason: value(form, "reason"), returnPath: value(form, "returnPath"),
  });
  if (!parsed.success) return failure("Review the damaged or missing quantity and approval reason.", parsed.error.flatten().fieldErrors);
  const input = parsed.data;
  const supabase = await createClient();
  const { data, error } = await supabase.rpc("approve_transfer_variance", {
    p_idempotency_key: input.idempotencyKey, p_transfer_item_id: input.transferItemId,
    p_quantity: input.quantity, p_reason: input.reason,
  });
  if (error) return failure(friendlyInventoryError(error));
  revalidatePath("/inventory/transfers"); revalidatePath("/requests"); revalidatePath(input.returnPath);
  redirect(`${input.returnPath}?variance=${data}`);
}

export async function stockOutAction(_: InventoryActionState, form: FormData): Promise<InventoryActionState> {
  const user = await requireUser(); if (!user.canManage) return failure("Only an administrator can approve a direct stock-out exception.");
  const parsed = stockOutInputSchema.safeParse({ ...basePayload(form), sourceLocationId: value(form, "sourceLocationId") });
  if (!parsed.success) return failure("Review the stock-out details.", parsed.error.flatten().fieldErrors);
  const input = parsed.data; const supabase = await createClient();
  const { data, error } = await supabase.rpc("post_stock_out", { p_idempotency_key: input.idempotencyKey, p_material_id: input.materialId, p_source_location_id: input.sourceLocationId, p_quantity: input.quantity, p_unit_id: input.unitId, p_reference_document: input.referenceNumber, p_transaction_date: input.transactionDate, p_project_id: null, p_remarks: input.remarks || null });
  if (error) return failure(friendlyInventoryError(error));
  revalidatePath("/inventory"); revalidatePath("/inventory/transactions"); redirect(`/inventory/transactions?posted=${data}`);
}

export async function dispatchTransferAction(_: InventoryActionState, form: FormData): Promise<InventoryActionState> {
  try { await requireOperator(); } catch { return failure("You do not have permission to dispatch stock."); }
  const parsed = transferInputSchema.safeParse({ ...basePayload(form), sourceLocationId: value(form, "sourceLocationId"), destinationLocationId: value(form, "destinationLocationId") });
  if (!parsed.success) return failure("Review the transfer details.", parsed.error.flatten().fieldErrors);
  const input = parsed.data; const supabase = await createClient();
  const { data, error } = await supabase.rpc("dispatch_inventory_transfer", { p_idempotency_key: input.idempotencyKey, p_material_id: input.materialId, p_source_location_id: input.sourceLocationId, p_destination_location_id: input.destinationLocationId, p_quantity: input.quantity, p_unit_id: input.unitId, p_external_reference: input.referenceNumber, p_transaction_date: input.transactionDate, p_remarks: input.remarks || null });
  if (error) return failure(friendlyInventoryError(error));
  revalidatePath("/inventory"); revalidatePath("/inventory/transfers"); revalidatePath("/inventory/transactions"); redirect(`/inventory/transfers?posted=${data}`);
}

export async function returnSiteStockAction(_: InventoryActionState, form: FormData): Promise<InventoryActionState> {
  const user = await requireUser();
  if (!user.canManage) return failure("Only an administrator can authorize unused site stock returns.");
  const parsed = transferInputSchema.safeParse({ ...basePayload(form), sourceLocationId: value(form, "sourceLocationId"), destinationLocationId: value(form, "destinationLocationId") });
  if (!parsed.success) return failure("Review the site return details.", parsed.error.flatten().fieldErrors);
  const input = parsed.data;
  if (!input.remarks || input.remarks.trim().length < 3) return failure("Enter a return reason of at least three characters.", { remarks: ["Return reason is required."] });
  const supabase = await createClient();
  const { data: locations, error: locationError } = await supabase.from("inventory_locations")
    .select("id,location_type").in("id", [input.sourceLocationId, input.destinationLocationId]);
  if (locationError || locations?.find((item) => item.id === input.sourceLocationId)?.location_type !== "project_site"
    || locations?.find((item) => item.id === input.destinationLocationId)?.location_type !== "warehouse")
    return failure("Choose a project site and a receiving warehouse.");
  const { data, error } = await supabase.rpc("dispatch_inventory_transfer", {
    p_idempotency_key: input.idempotencyKey, p_material_id: input.materialId,
    p_source_location_id: input.sourceLocationId, p_destination_location_id: input.destinationLocationId,
    p_quantity: input.quantity, p_unit_id: input.unitId, p_external_reference: input.referenceNumber,
    p_transaction_date: input.transactionDate, p_remarks: input.remarks,
  });
  if (error) return failure(friendlyInventoryError(error));
  revalidatePath("/inventory"); revalidatePath("/inventory/transfers"); revalidatePath("/inventory/transactions");
  redirect(`/inventory/transfers?posted=${data}`);
}

export async function receiveTransferAction(_: InventoryActionState, form: FormData): Promise<InventoryActionState> {
  try { await requireOperator(); } catch { return failure("You do not have permission to receive this transfer."); }
  const parsed = transferReceiptInputSchema.safeParse({ idempotencyKey: value(form, "idempotencyKey"), transferItemId: value(form, "transferItemId"), quantity: value(form, "quantity"), transactionDate: value(form, "transactionDate"), remarks: value(form, "remarks") });
  if (!parsed.success) return failure("Review the receipt details.", parsed.error.flatten().fieldErrors);
  const input = parsed.data; const supabase = await createClient();
  const { data, error } = await supabase.rpc("receive_inventory_transfer", { p_idempotency_key: input.idempotencyKey, p_transfer_item_id: input.transferItemId, p_quantity: input.quantity, p_transaction_date: input.transactionDate, p_remarks: input.remarks || null });
  if (error) return failure(friendlyInventoryError(error));
  revalidatePath("/inventory"); revalidatePath("/inventory/transfers"); revalidatePath("/inventory/transactions"); redirect(`/inventory/transfers?received=${data}`);
}

export async function reverseTransactionAction(_: InventoryActionState, form: FormData): Promise<InventoryActionState> {
  const user = await requireUser(); if (!user.canManage) return failure("Only administrators can reverse posted transactions.");
  const parsed = reversalInputSchema.safeParse({ idempotencyKey: value(form, "idempotencyKey"), transactionId: value(form, "transactionId"), reason: value(form, "reason") });
  if (!parsed.success) return failure("A valid reversal reason is required.", parsed.error.flatten().fieldErrors);
  const supabase = await createClient(); const { data, error } = await supabase.rpc("reverse_inventory_transaction", { p_idempotency_key: parsed.data.idempotencyKey, p_transaction_id: parsed.data.transactionId, p_reason: parsed.data.reason });
  if (error) return failure(friendlyInventoryError(error));
  revalidatePath("/inventory"); revalidatePath("/inventory/transfers"); revalidatePath("/inventory/transactions"); redirect(`/inventory/transactions?reversed=${data}`);
}
