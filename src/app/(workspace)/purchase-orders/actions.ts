"use server";

import { cancelPurchaseOrderSchema, decidePurchaseOwnerApprovalSchema, inspectPurchaseDeliverySchema, issuePurchaseOrderSchema, receivePurchaseOrderLineSchema, recordSupplierPaymentSchema, recordSupplierQuotationSchema, uuidSchema, voidSupplierPaymentSchema } from "@nognog/domain";
import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { requireFinanceViewer, requireManager, requireUser } from "@/lib/auth";
import { createClient } from "@/lib/supabase/server";

export type PurchaseActionState = { message: string; fieldErrors?: Record<string, string[]> };
const value = (form: FormData, key: string) => String(form.get(key) ?? "");
const fail = (message: string, fieldErrors?: Record<string, string[]>): PurchaseActionState => ({ message, fieldErrors });

function purchaseError(error: { code?: string; message: string }) {
  if (error.message.includes("warehouse is not available to inspect")) return "You are not assigned to this purchase order's warehouse.";
  if (error.message.includes("quotation is not valid")) return "The selected quotation is expired, from another supplier, or dated after this purchase.";
  if (error.message.includes("Accepted quantity exceeds")) return "The accepted quantity is more than the amount still expected on the purchase order.";
  if (error.message.includes("open inspection")) return "This delivery reference already has an inspection waiting for receipt.";
  if (error.code === "42501") return "Only an administrator can perform this purchase action.";
  if (error.message.includes("Owner approval is required")) return "Purchases above ₱50,000 must be approved by Admin before an order is issued.";
  if (error.message.includes("Accepted delivery inspection")) return "Inspect and accept the delivered quantity before adding it to inventory.";
  if (error.message.includes("selected quotation")) return "The purchase items must match the selected supplier quotation.";
  if (error.message.includes("chosen shortage material") || error.message.includes("already sourced as a different material")) return "Choose the catalog material already linked to this out-of-stock report.";
  if (error.message.includes("Out-of-stock report is unavailable")) return "This out-of-stock report is closed or belongs to another warehouse. Refresh the report.";
  if (error.message.includes("different shortage sourcing")) return "This purchase was already submitted for another out-of-stock material. Refresh purchases.";
  if (error.message.includes("requires Engineer approval")) return "The linked material request must be approved by its Engineer before purchasing.";
  if (error.message.includes("linked request")) return "Choose only materials from the linked project request.";
  if (error.message.includes("unit price")) return "Enter a price greater than zero for every item.";
  if (error.message.includes("each material once")) return "Choose each item once.";
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
  const materialRequestId = value(form, "materialRequestId");
  const supplierQuotationId = value(form, "supplierQuotationId");
  const sourceReportId = value(form, "sourceReportId");
  const sourceMaterialId = value(form, "sourceMaterialId");
  if ((materialRequestId && !uuidSchema.safeParse(materialRequestId).success) ||
    (supplierQuotationId && !uuidSchema.safeParse(supplierQuotationId).success) ||
    (sourceReportId && !uuidSchema.safeParse(sourceReportId).success) ||
    (sourceMaterialId && !uuidSchema.safeParse(sourceMaterialId).success) ||
    Boolean(sourceReportId) !== Boolean(sourceMaterialId) ||
    (sourceReportId && materialRequestId)) return fail("The linked report, request or quotation is invalid.");
  const purchaseArgs = {
    p_idempotency_key: input.idempotencyKey, p_supplier_id: input.supplierId,
    p_warehouse_id: input.warehouseId, p_ordered_on: input.orderedOn,
    p_expected_on: input.expectedOn || null, p_purpose: input.purpose || null, p_lines: input.lines,
    p_supplier_quotation_id: supplierQuotationId || null,
  };
  const { data, error } = sourceReportId
    ? await supabase.rpc("submit_sourcing_purchase", { ...purchaseArgs, p_report_id: sourceReportId, p_material_id: sourceMaterialId })
    : await supabase.rpc("submit_procurement_purchase", { ...purchaseArgs, p_material_request_id: materialRequestId || null });
  if (error) return fail(purchaseError(error));
  if (!data || !uuidSchema.safeParse(data.id).success) return fail("The purchase result could not be verified. Refresh purchases before retrying.");
  revalidatePath("/purchase-orders");
  redirect(data.kind === "issued" ? `/purchase-orders/${data.id}` : `/purchase-orders/approvals/${data.id}`);
}

export async function recordSupplierQuotationAction(_: PurchaseActionState, form: FormData): Promise<PurchaseActionState> {
  try { await requireManager(); } catch { return fail("Only Admin can record supplier quotations."); }
  let lines: unknown;
  try { lines = JSON.parse(value(form, "lines")); } catch { return fail("Add at least one valid quotation item."); }
  const parsed = recordSupplierQuotationSchema.safeParse({
    idempotencyKey: value(form, "idempotencyKey"), supplierId: value(form, "supplierId"),
    reference: value(form, "reference"), quotedOn: value(form, "quotedOn"),
    validUntil: value(form, "validUntil"), notes: value(form, "notes"), lines,
  });
  if (!parsed.success) return fail("Review the quotation details.", parsed.error.flatten().fieldErrors);
  const input = parsed.data;
  const { data, error } = await (await createClient()).rpc("record_supplier_quotation", {
    p_idempotency_key: input.idempotencyKey, p_supplier_id: input.supplierId,
    p_reference: input.reference, p_quoted_on: input.quotedOn,
    p_valid_until: input.validUntil || null, p_notes: input.notes || null, p_lines: input.lines,
  });
  if (error) return fail(error.code === "23505" ? "This supplier quotation reference already exists." : purchaseError(error));
  if (!data) return fail("The quotation could not be verified. Refresh before retrying.");
  revalidatePath("/purchase-orders/quotations");
  redirect(`/purchase-orders/quotations?posted=1`);
}

export async function inspectPurchaseDeliveryAction(_: PurchaseActionState, form: FormData): Promise<PurchaseActionState> {
  const user = await requireUser();
  if (!user.canOperateInventory) return fail("Only Admin or assigned warehouse staff can inspect deliveries.");
  const parsed = inspectPurchaseDeliverySchema.safeParse({
    idempotencyKey: value(form, "idempotencyKey"), orderId: value(form, "orderId"),
    lineId: value(form, "lineId"), deliveredQuantity: value(form, "deliveredQuantity"),
    acceptedQuantity: value(form, "acceptedQuantity"), deliveryReference: value(form, "deliveryReference"),
    inspectedOn: value(form, "inspectedOn"), qualityNote: value(form, "qualityNote"),
  });
  if (!parsed.success) return fail("Review the inspection details.", parsed.error.flatten().fieldErrors);
  const input = parsed.data;
  const supabase = await createClient();
  const { error } = await supabase.rpc("inspect_purchase_delivery", {
    p_idempotency_key: input.idempotencyKey, p_line_id: input.lineId,
    p_delivered_quantity: input.deliveredQuantity, p_accepted_quantity: input.acceptedQuantity,
    p_delivery_reference: input.deliveryReference, p_inspected_on: input.inspectedOn,
    p_quality_note: input.qualityNote || null,
  });
  if (error) return fail(purchaseError(error));
  revalidatePath("/purchase-orders/receive");
  revalidatePath(`/purchase-orders/${input.orderId}`);
  const outcome = Number(input.acceptedQuantity) > 0 ? "inspected" : "inspection-rejected";
  if (value(form, "source") === "warehouse") redirect(`/purchase-orders/receive?posted=${outcome}`);
  redirect(`/purchase-orders/${input.orderId}?posted=${outcome}`);
}

export async function decidePurchaseOwnerApprovalAction(_: PurchaseActionState, form: FormData): Promise<PurchaseActionState> {
  try { await requireManager(); } catch { return fail("Only Admin can approve a purchase above ₱50,000."); }
  const parsed = decidePurchaseOwnerApprovalSchema.safeParse({
    requestId: value(form, "requestId"), decision: value(form, "decision"), reason: value(form, "reason"),
  });
  if (!parsed.success) return fail("Review the decision details.", parsed.error.flatten().fieldErrors);
  const input = parsed.data;
  const supabase = await createClient();
  const { data, error } = await supabase.rpc("decide_purchase_owner_approval", {
    p_request_id: input.requestId, p_approve: input.decision === "approve", p_reason: input.reason || null,
  });
  if (error) return fail(purchaseError(error));
  revalidatePath("/purchase-orders");
  revalidatePath(`/purchase-orders/approvals/${input.requestId}`);
  if (data) redirect(`/purchase-orders/${data}?posted=owner-approved`);
  redirect(`/purchase-orders/approvals/${input.requestId}?posted=rejected`);
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

function paymentError(error: { code?: string; message: string }) {
  if (error.code === "42501") return "You do not have permission to change supplier payments.";
  if (error.message.includes("exceeds the purchase order balance")) return "The amount is more than the unpaid balance of this purchase.";
  if (error.message.includes("bank and check number")) return "Enter the bank and check number for a check payment.";
  if (error.message.includes("cancelled purchase order")) return "A cancelled purchase cannot be paid.";
  if (error.message.includes("already void")) return "This payment is already void.";
  return "The payment could not be saved. Please try again.";
}

function revalidatePayments(orderId: string) {
  revalidatePath("/purchase-orders");
  revalidatePath(`/purchase-orders/${orderId}`);
  revalidatePath("/suppliers", "layout");
}

// Admin and Finance record how a purchase was paid: cash or check.
export async function recordSupplierPaymentAction(_: PurchaseActionState, form: FormData): Promise<PurchaseActionState> {
  try { await requireFinanceViewer(); } catch { return fail("Only Admin or Finance can record supplier payments."); }
  const parsed = recordSupplierPaymentSchema.safeParse({
    idempotencyKey: value(form, "idempotencyKey"), orderId: value(form, "orderId"), method: value(form, "method"),
    bankName: value(form, "bankName"), checkNumber: value(form, "checkNumber"), amount: value(form, "amount"),
    paymentDate: value(form, "paymentDate"), remarks: value(form, "remarks"),
  });
  if (!parsed.success) return fail("Review the payment details.", parsed.error.flatten().fieldErrors);
  const input = parsed.data;
  const supabase = await createClient();
  const { error } = await supabase.rpc("record_supplier_payment", {
    p_idempotency_key: input.idempotencyKey, p_order_id: input.orderId, p_method: input.method,
    p_bank_name: input.method === "check" ? input.bankName : null, p_check_number: input.method === "check" ? input.checkNumber : null,
    p_amount: input.amount, p_payment_date: input.paymentDate, p_remarks: input.remarks || null,
  });
  if (error) return fail(paymentError(error));
  revalidatePayments(input.orderId);
  redirect(`/purchase-orders/${input.orderId}?posted=payment`);
}

export async function voidSupplierPaymentAction(_: PurchaseActionState, form: FormData): Promise<PurchaseActionState> {
  try { await requireManager(); } catch { return fail("Only an administrator can void a supplier payment."); }
  const parsed = voidSupplierPaymentSchema.safeParse({ paymentId: value(form, "paymentId"), reason: value(form, "reason") });
  if (!parsed.success) return fail("Enter a reason of at least three characters.", parsed.error.flatten().fieldErrors);
  const orderId = value(form, "orderId");
  if (!uuidSchema.safeParse(orderId).success) return fail("The purchase order could not be found. Refresh and try again.");
  const supabase = await createClient();
  const { error } = await supabase.rpc("void_supplier_payment", { p_payment_id: parsed.data.paymentId, p_reason: parsed.data.reason });
  if (error) return fail(paymentError(error));
  revalidatePayments(orderId);
  redirect(`/purchase-orders/${orderId}?posted=payment-void`);
}
