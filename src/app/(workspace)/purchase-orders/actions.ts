"use server";

import { cancelPurchaseOrderSchema, issuePurchaseOrderSchema, receivePurchaseOrderLineSchema } from "@nognog/domain";
import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { requireManager, requireUser } from "@/lib/auth";
import { createClient } from "@/lib/supabase/server";

export type PurchaseActionState = { message: string; fieldErrors?: Record<string, string[]> };
const value = (form: FormData, key: string) => String(form.get(key) ?? "");
const fail = (message: string, fieldErrors?: Record<string, string[]>): PurchaseActionState => ({ message, fieldErrors });

function purchaseError(error: { code?: string; message: string }) {
  if (error.code === "42501") return "Only an administrator can perform this purchase action.";
  if (error.message.includes("No active PHP price")) return "A selected supplier material has no valid PHP price for the order date.";
  if (error.message.includes("below the supplier minimum")) return "A line is below the supplier minimum order quantity.";
  if (error.message.includes("opening value") || error.message.includes("valuation")) return "Verify the warehouse opening quantity and value before receiving this material.";
  if (error.message.includes("exceeds ordered quantity")) return "The receipt exceeds the unreceived order quantity or predates the order.";
  if (error.message.includes("difference from the PO")) return "Enter a reason for the difference from the PO price.";
  if (error.message.includes("delivery_line_unique")) return "This delivery reference is already recorded for the line.";
  if (error.code === "23505") return "This purchase action conflicts with an existing record. Refresh and try again.";
  return "The purchase action could not be completed. No stock was posted.";
}

export async function issuePurchaseOrderAction(_: PurchaseActionState, form: FormData): Promise<PurchaseActionState> {
  try { await requireManager(); } catch { return fail("Only an administrator can issue purchase orders."); }
  let lines: unknown;
  try { lines = JSON.parse(value(form, "lines")); } catch { return fail("Add at least one valid material line."); }
  const parsed = issuePurchaseOrderSchema.safeParse({
    idempotencyKey: value(form, "idempotencyKey"), supplierId: value(form, "supplierId"),
    warehouseId: value(form, "warehouseId"), orderedOn: value(form, "orderedOn"),
    expectedOn: value(form, "expectedOn"), purpose: value(form, "purpose"), lines,
  });
  if (!parsed.success) return fail("Review the purchase order details.", parsed.error.flatten().fieldErrors);
  const input = parsed.data;
  const supabase = await createClient();
  const { data, error } = await supabase.rpc("issue_purchase_order", {
    p_idempotency_key: input.idempotencyKey, p_supplier_id: input.supplierId,
    p_warehouse_id: input.warehouseId, p_ordered_on: input.orderedOn,
    p_expected_on: input.expectedOn, p_purpose: input.purpose, p_lines: input.lines,
  });
  if (error) return fail(purchaseError(error));
  revalidatePath("/purchase-orders");
  redirect(`/purchase-orders/${data}`);
}

export async function receivePurchaseOrderLineAction(_: PurchaseActionState, form: FormData): Promise<PurchaseActionState> {
  try { await requireManager(); } catch { return fail("Only an administrator can post valued purchase receipts."); }
  const parsed = receivePurchaseOrderLineSchema.safeParse({
    idempotencyKey: value(form, "idempotencyKey"), orderId: value(form, "orderId"), lineId: value(form, "lineId"),
    quantity: value(form, "quantity"), goodsTotalCost: value(form, "goodsTotalCost"),
    deliveryReference: value(form, "deliveryReference"), receivedOn: value(form, "receivedOn"),
    costVarianceReason: value(form, "costVarianceReason"),
  });
  if (!parsed.success) return fail("Review the delivery details.", parsed.error.flatten().fieldErrors);
  const input = parsed.data;
  const supabase = await createClient();
  const { data: line, error: lookupError } = await supabase.from("purchase_order_lines").select("purchase_order_id").eq("id", input.lineId).single();
  if (lookupError || line?.purchase_order_id !== input.orderId) return fail("The line does not belong to this purchase order.");
  const { error } = await supabase.rpc("receive_purchase_order_line", {
    p_idempotency_key: input.idempotencyKey, p_line_id: input.lineId,
    p_quantity: input.quantity, p_goods_total_cost: input.goodsTotalCost,
    p_delivery_reference: input.deliveryReference, p_received_on: input.receivedOn,
    p_cost_variance_reason: input.costVarianceReason || null,
  });
  if (error) return fail(purchaseError(error));
  revalidatePath("/purchase-orders");
  revalidatePath(`/purchase-orders/${input.orderId}`);
  revalidatePath("/inventory");
  redirect(`/purchase-orders/${input.orderId}?posted=receipt`);
}

// Warehouse Staff (and Admin) record a delivery at the PO price; no cost is sent.
const warehouseDeliverySchema = receivePurchaseOrderLineSchema.omit({ goodsTotalCost: true, costVarianceReason: true });

export async function receiveWarehouseDeliveryAction(_: PurchaseActionState, form: FormData): Promise<PurchaseActionState> {
  const user = await requireUser();
  if (!user.canOperateInventory) return fail("Only assigned warehouse staff or an administrator can receive deliveries.");
  const parsed = warehouseDeliverySchema.safeParse({
    idempotencyKey: value(form, "idempotencyKey"), orderId: value(form, "orderId"), lineId: value(form, "lineId"),
    quantity: value(form, "quantity"), deliveryReference: value(form, "deliveryReference"), receivedOn: value(form, "receivedOn"),
  });
  if (!parsed.success) return fail("Review the delivery details.", parsed.error.flatten().fieldErrors);
  const input = parsed.data;
  const supabase = await createClient();
  const { error } = await supabase.rpc("receive_purchase_order_line", {
    p_idempotency_key: input.idempotencyKey, p_line_id: input.lineId, p_quantity: input.quantity,
    p_goods_total_cost: null, p_delivery_reference: input.deliveryReference, p_received_on: input.receivedOn,
  });
  if (error) return fail(error.code === "42501" ? "You are not assigned to this purchase order's warehouse." : purchaseError(error));
  revalidatePath("/purchase-orders/receive");
  revalidatePath(`/purchase-orders/${input.orderId}`);
  revalidatePath("/inventory");
  redirect("/purchase-orders/receive?posted=1");
}

export async function cancelPurchaseOrderAction(_: PurchaseActionState, form: FormData): Promise<PurchaseActionState> {
  try { await requireManager(); } catch { return fail("Only an administrator can cancel purchase orders."); }
  const parsed = cancelPurchaseOrderSchema.safeParse({ orderId: value(form, "orderId"), reason: value(form, "reason") });
  if (!parsed.success) return fail("Enter a cancellation reason.", parsed.error.flatten().fieldErrors);
  const supabase = await createClient();
  const { error } = await supabase.rpc("cancel_purchase_order", { p_order_id: parsed.data.orderId, p_reason: parsed.data.reason });
  if (error) return fail(purchaseError(error));
  revalidatePath("/purchase-orders");
  revalidatePath(`/purchase-orders/${parsed.data.orderId}`);
  redirect(`/purchase-orders/${parsed.data.orderId}?posted=cancelled`);
}
