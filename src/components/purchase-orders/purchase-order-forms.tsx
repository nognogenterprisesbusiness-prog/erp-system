"use client";

import { useActionState, useId, useState } from "react";
import { cancelPurchaseOrderAction, decidePurchaseOwnerApprovalAction, inspectPurchaseDeliveryAction, issuePurchaseOrderAction, receivePurchaseOrderLineAction, receiveWarehouseDeliveryAction, recordSupplierPaymentAction, recordSupplierQuotationAction, voidSupplierPaymentAction, type PurchaseActionState } from "@/app/(workspace)/purchase-orders/actions";
import { Button } from "@/components/ui/button";
import { DatePicker } from "@/components/ui/date-picker";
import { FormField, fieldControlClass } from "@/components/ui/form-field";
import { SelectPicker } from "@/components/ui/select-picker";
import { RecordFormControls } from "@/components/ui/record-create-dialog";
import type { getPurchaseOrderChoices } from "@/lib/data/purchase-orders";
import { isValidPurchaseQuantity, isValidPurchaseUnitPrice, PurchaseLineItems, type PurchaseLineInput } from "@/components/purchasing/purchase-line-items";

type Choices = Awaited<ReturnType<typeof getPurchaseOrderChoices>>;
type Line = PurchaseLineInput & { priceEdited?: boolean };
export type LinkedQuotation = { id: string; reference: string; supplierId: string; lines: { materialId: string; quantity: string; unitPrice: string }[] };
export type LinkedRequest = { id: string; number: string; warehouseId: string; lines: { materialId: string; quantity: string }[] };
export type AcceptedInspection = { id: string; delivery_reference: string; inspected_on: string; accepted_quantity: number; delivered_quantity: number; quality_note: string | null };
const initialState: PurchaseActionState = { message: "" };
const peso = new Intl.NumberFormat("en-PH", { style: "currency", currency: "PHP" });

// Purchase like the client's sheet: supplier, warehouse, date, then item,
// quantity and price per line. The price starts at the supplier's latest price.
export function IssuePurchaseOrderForm({ choices, idempotencyKey, today, initialMaterialId, initialWarehouseId, initialQuantity, quotation, sourceRequest }: { choices: Choices; idempotencyKey: string; today: string; initialMaterialId?: string; initialWarehouseId?: string; initialQuantity?: string; quotation?: LinkedQuotation; sourceRequest?: LinkedRequest }) {
  const [state, action, pending] = useActionState(issuePurchaseOrderAction, initialState);
  const [supplierId, setSupplierId] = useState(quotation?.supplierId ?? choices.suppliers[0]?.id ?? "");
  const [warehouseId, setWarehouseId] = useState(sourceRequest?.warehouseId ?? initialWarehouseId ?? choices.warehouses[0]?.id ?? "");
  const latestPrice = (supplier: string, materialId: string) => {
    const price = choices.latestPrices[`${supplier}:${materialId}`];
    return price === undefined ? "" : price.toFixed(2);
  };
  const initialLines = quotation?.lines ?? sourceRequest?.lines.map((line) => ({ ...line, unitPrice: latestPrice(supplierId, line.materialId) })) ?? [{ materialId: initialMaterialId ?? "", quantity: initialQuantity ?? "", unitPrice: initialMaterialId ? latestPrice(supplierId, initialMaterialId) : "" }];
  const [lines, setLines] = useState<Line[]>(initialLines.map((line, key) => ({ ...line, key })));
  const [nextKey, setNextKey] = useState(initialLines.length);
  const error = (field: string) => state.fieldErrors?.[field]?.[0];
  const updateLine = (key: number, patch: Partial<Line>) => setLines((current) => current.map((line) => line.key === key ? { ...line, ...patch } : line));
  const changeSupplier = (next: string) => {
    setSupplierId(next);
    // Refill prices the user has not typed over with the new supplier's latest price.
    setLines((current) => current.map((line) => line.materialId && !line.priceEdited ? { ...line, unitPrice: latestPrice(next, line.materialId) } : line));
  };
  return <form action={action} className="rounded-xl border border-slate-200 bg-white p-5 sm:p-6">
    <input type="hidden" name="idempotencyKey" value={idempotencyKey} />
    <input type="hidden" name="materialRequestId" value={sourceRequest?.id ?? ""} /><input type="hidden" name="supplierQuotationId" value={quotation?.id ?? ""} />
    <input type="hidden" name="supplierId" value={supplierId} /><input type="hidden" name="warehouseId" value={warehouseId} />
    <input type="hidden" name="lines" value={JSON.stringify(lines.map(({ materialId, quantity, unitPrice }) => ({ materialId, quantity, unitPrice })))} />
    <div className="grid gap-5 md:grid-cols-3">
      <FormField label="Supplier" htmlFor="poSupplier" error={error("supplierId")}><SelectPicker id="poSupplier" className="h-11" label="Supplier" value={supplierId} disabled={Boolean(quotation)} onValueChange={changeSupplier} options={choices.suppliers.map((item) => ({ value: item.id, label: item.supplier_name }))} /></FormField>
      <FormField label="Deliver to warehouse" htmlFor="poWarehouse" error={error("warehouseId")}><SelectPicker id="poWarehouse" className="h-11" label="Deliver to warehouse" value={warehouseId} disabled={Boolean(sourceRequest)} onValueChange={setWarehouseId} options={choices.warehouses.map((item) => ({ value: item.id, label: item.name }))} /></FormField>
      <FormField label="Purchase date" htmlFor="orderedOn" error={error("orderedOn")}><DatePicker className="[&>button]:h-11 [&>button]:rounded-lg" id="orderedOn" name="orderedOn" label="Purchase date" defaultValue={today} allowClear={false} required /></FormField>
    </div>
    {(quotation || sourceRequest) && <p className="mt-4 rounded-lg bg-sky-50 px-4 py-3 text-sm text-sky-900">{sourceRequest ? `Linked to material request ${sourceRequest.number}. ` : ""}{quotation ? `Using supplier quotation ${quotation.reference}; its items, quantities and prices are fixed.` : ""}</p>}
    <div className="mt-7"><PurchaseLineItems lines={lines} materials={sourceRequest ? choices.materials.filter((item) => sourceRequest.lines.some((line) => line.materialId === item.id)) : choices.materials} maxLines={50} pending={pending} locked={Boolean(quotation)} idPrefix="po" onAdd={() => { setLines((current) => [...current, { key: nextKey, materialId: "", quantity: "", unitPrice: "" }]); setNextKey((value) => value + 1); }} onRemove={(key) => setLines((current) => current.filter((line) => line.key !== key))} onUpdate={(key, patch) => {
      if (patch.materialId !== undefined) updateLine(key, { ...patch, unitPrice: latestPrice(supplierId, patch.materialId), priceEdited: false });
      else updateLine(key, { ...patch, ...(patch.unitPrice !== undefined ? { priceEdited: true } : {}) });
    }} /></div>
    <details className="mt-4 rounded-lg border border-slate-200 p-3"><summary className="cursor-pointer text-sm font-medium text-slate-700">Expected delivery and notes (optional)</summary><div className="mt-3 grid gap-4 md:grid-cols-2">
      <FormField label="Expected delivery" htmlFor="expectedOn" error={error("expectedOn")}><DatePicker className="[&>button]:h-11 [&>button]:rounded-lg" id="expectedOn" name="expectedOn" label="Expected delivery" /></FormField>
      <FormField label="Notes" htmlFor="purpose" error={error("purpose")}><input id="purpose" name="purpose" maxLength={500} className={fieldControlClass} /></FormField>
    </div></details>
    {error("lines") && <p role="alert" className="mt-2 text-xs text-red-700">{error("lines")}</p>}
    {state.message && <p role="alert" className="mt-5 text-sm text-red-700">{state.message}</p>}
    <p className="mt-4 text-sm text-slate-600">Purchases up to ₱50,000 issue immediately. A larger purchase waits for Admin owner approval before the order and supplier price are posted.</p>
    <RecordFormControls busy={pending} disabled={!supplierId || !warehouseId || lines.some((line) => !line.materialId || !isValidPurchaseQuantity(line.quantity) || !isValidPurchaseUnitPrice(line.unitPrice))} label="Submit purchase" />
  </form>;
}

export function PurchaseApprovalForm({ requestId, decision }: { requestId: string; decision: "approve" | "reject" }) {
  const [state, action, pending] = useActionState(decidePurchaseOwnerApprovalAction, initialState);
  const id = useId();
  return <form action={action} className="space-y-4">
    <input type="hidden" name="requestId" value={requestId} />
    <input type="hidden" name="decision" value={decision} />
    <FormField label={decision === "approve" ? "Approval note (optional)" : "Reason for rejection"} htmlFor={id} error={state.fieldErrors?.reason?.[0]}>
      <input id={id} name="reason" className={fieldControlClass} maxLength={500} minLength={decision === "reject" ? 3 : undefined} required={decision === "reject"} />
    </FormField>
    {state.message && <p role="alert" className="text-sm text-red-700">{state.message}</p>}
    <RecordFormControls busy={pending} label={decision === "approve" ? "Approve and issue purchase order" : "Reject purchase"} />
  </form>;
}

export function SupplierQuotationForm({ choices, idempotencyKey, today }: { choices: Choices; idempotencyKey: string; today: string }) {
  const [state, action, pending] = useActionState(recordSupplierQuotationAction, initialState);
  const [supplierId, setSupplierId] = useState(choices.suppliers[0]?.id ?? "");
  const [lines, setLines] = useState<Line[]>([{ key: 0, materialId: "", quantity: "", unitPrice: "" }]);
  const [nextKey, setNextKey] = useState(1);
  const error = (field: string) => state.fieldErrors?.[field]?.[0];
  return <form action={action} className="rounded-xl border border-slate-200 bg-white p-5 sm:p-6">
    <input type="hidden" name="idempotencyKey" value={idempotencyKey} />
    <input type="hidden" name="supplierId" value={supplierId} />
    <input type="hidden" name="lines" value={JSON.stringify(lines.map(({ materialId, quantity, unitPrice }) => ({ materialId, quantity, unitPrice })))} />
    <div className="grid gap-4 sm:grid-cols-2">
      <FormField label="Supplier" htmlFor="quoteSupplier" error={error("supplierId")}><SelectPicker id="quoteSupplier" label="Supplier" value={supplierId} onValueChange={setSupplierId} options={choices.suppliers.map((item) => ({ value: item.id, label: item.supplier_name }))} /></FormField>
      <FormField label="Supplier quotation reference" htmlFor="quoteReference" error={error("reference")}><input id="quoteReference" name="reference" className={fieldControlClass} maxLength={120} required /></FormField>
      <FormField label="Quote date" htmlFor="quotedOn" error={error("quotedOn")}><DatePicker id="quotedOn" name="quotedOn" label="Quote date" defaultValue={today} allowClear={false} required /></FormField>
      <FormField label="Valid until (optional)" htmlFor="validUntil" error={error("validUntil")}><DatePicker id="validUntil" name="validUntil" label="Valid until" /></FormField>
    </div>
    <div className="mt-6"><PurchaseLineItems title="Quoted materials" lines={lines} materials={choices.materials} maxLines={50} pending={pending} idPrefix="quote" onAdd={() => { setLines((current) => [...current, { key: nextKey, materialId: "", quantity: "", unitPrice: "" }]); setNextKey((value) => value + 1); }} onRemove={(key) => setLines((current) => current.filter((line) => line.key !== key))} onUpdate={(key, patch) => setLines((current) => current.map((line) => line.key === key ? { ...line, ...patch } : line))} /></div>
    <FormField label="Quote note (optional)" htmlFor="quoteNotes" className="mt-4" error={error("notes")}><input id="quoteNotes" name="notes" className={fieldControlClass} maxLength={500} /></FormField>
    {state.message && <p role="alert" className="mt-4 text-sm text-red-700">{state.message}</p>}
    <p className="mt-4 text-sm text-slate-600">Saving a quote records an offered price. It does not update supplier price history, issue an order or change stock.</p>
    <RecordFormControls busy={pending} disabled={!supplierId || lines.some((line) => !line.materialId || !isValidPurchaseQuantity(line.quantity) || !isValidPurchaseUnitPrice(line.unitPrice))} label="Save quotation" />
  </form>;
}

export function PurchaseDeliveryInspectionForm({ orderId, lineId, remaining, unitSymbol, idempotencyKey, today, source = "order" }: {
  orderId: string; lineId: string; remaining: number; unitSymbol: string; idempotencyKey: string; today: string; source?: "order" | "warehouse";
}) {
  const [state, action, pending] = useActionState(inspectPurchaseDeliveryAction, initialState);
  const [delivered, setDelivered] = useState(String(remaining));
  const [accepted, setAccepted] = useState(String(remaining));
  const error = (field: string) => state.fieldErrors?.[field]?.[0];
  return <form action={action} className="grid gap-4 sm:grid-cols-2">
    <input type="hidden" name="idempotencyKey" value={idempotencyKey} /><input type="hidden" name="orderId" value={orderId} />
    <input type="hidden" name="lineId" value={lineId} /><input type="hidden" name="source" value={source} />
    <FormField label={`Delivered quantity (${unitSymbol})`} htmlFor={`inspect-delivered-${lineId}`} error={error("deliveredQuantity")}><input id={`inspect-delivered-${lineId}`} name="deliveredQuantity" className={fieldControlClass} inputMode="decimal" value={delivered} onChange={(event) => { setDelivered(event.target.value); setAccepted(event.target.value); }} required /></FormField>
    <FormField label={`Accepted quantity (${unitSymbol})`} htmlFor={`inspect-accepted-${lineId}`} error={error("acceptedQuantity")} hint="Enter zero if the entire delivery is rejected."><input id={`inspect-accepted-${lineId}`} name="acceptedQuantity" className={fieldControlClass} inputMode="decimal" value={accepted} onChange={(event) => setAccepted(event.target.value)} required /></FormField>
    <FormField label="Delivery receipt number" htmlFor={`inspect-ref-${lineId}`} error={error("deliveryReference")}><input id={`inspect-ref-${lineId}`} name="deliveryReference" className={fieldControlClass} maxLength={120} required /></FormField>
    <FormField label="Inspection date" htmlFor={`inspect-date-${lineId}`} error={error("inspectedOn")}><DatePicker id={`inspect-date-${lineId}`} name="inspectedOn" label="Inspection date" defaultValue={today} allowClear={false} required /></FormField>
    <FormField label="Quality or rejection note" htmlFor={`inspect-note-${lineId}`} className="sm:col-span-2" error={error("qualityNote")} hint="Required if any delivered quantity is not accepted."><input id={`inspect-note-${lineId}`} name="qualityNote" className={fieldControlClass} maxLength={500} required={Number(accepted) < Number(delivered)} /></FormField>
    {state.message && <p role="alert" className="text-sm text-red-700 sm:col-span-2">{state.message}</p>}
    <div className="sm:col-span-2"><RecordFormControls busy={pending} disabled={!isValidPurchaseQuantity(delivered) || !/^\d+(?:\.\d{1,4})?$/.test(accepted) || Number(accepted) > Number(delivered)} label="Save inspection" /></div>
  </form>;
}

export function ReceivePurchaseLineForm({ orderId, lineId, remaining, unitPrice, unitSymbol, idempotencyKey, today, inspection }: { orderId: string; lineId: string; remaining: number; unitPrice: number; unitSymbol: string; idempotencyKey: string; today: string; inspection?: AcceptedInspection }) {
  const [state, action, pending] = useActionState(receivePurchaseOrderLineAction, initialState);
  const [quantity, setQuantity] = useState(String(inspection?.accepted_quantity ?? remaining));
  const [cost, setCost] = useState((Math.round((inspection?.accepted_quantity ?? remaining) * unitPrice * 100) / 100).toFixed(2));
  const error = (field: string) => state.fieldErrors?.[field]?.[0];
  return <form action={action} className="grid gap-4 rounded-lg border border-slate-200 bg-slate-50 p-4 sm:grid-cols-2">
    <input type="hidden" name="orderId" value={orderId} /><input type="hidden" name="lineId" value={lineId} /><input type="hidden" name="idempotencyKey" value={idempotencyKey} />
    <FormField label={`Accepted quantity (${unitSymbol})`} htmlFor={`po-receive-quantity-${inspection?.id ?? lineId}`} error={error("quantity")}><input id={`po-receive-quantity-${inspection?.id ?? lineId}`} name="quantity" inputMode="decimal" className={fieldControlClass} value={quantity} readOnly={Boolean(inspection)} onChange={(event) => { setQuantity(event.target.value); const next = Number(event.target.value); if (Number.isFinite(next)) setCost((Math.round(next * unitPrice * 100) / 100).toFixed(2)); }} required /></FormField>
    <FormField label="Actual goods cost (PHP)" htmlFor={`po-cost-${lineId}`} error={error("goodsTotalCost")} hint="Material cost on the delivery receipt, without freight or VAT."><input id={`po-cost-${lineId}`} name="goodsTotalCost" inputMode="decimal" className={fieldControlClass} value={cost} onChange={(event) => setCost(event.target.value)} required /></FormField>
    <FormField label="Delivery reference" htmlFor={`po-delivery-${inspection?.id ?? lineId}`} error={error("deliveryReference")}><input id={`po-delivery-${inspection?.id ?? lineId}`} name="deliveryReference" className={fieldControlClass} maxLength={120} value={inspection?.delivery_reference} readOnly={Boolean(inspection)} placeholder="DR-12345" required /></FormField>
    {inspection ? <><input type="hidden" name="receivedOn" value={inspection.inspected_on} /><p className="self-center text-sm text-slate-600">Inspected {inspection.inspected_on}{inspection.quality_note ? ` · ${inspection.quality_note}` : ""}</p></> : <FormField label="Receipt date" htmlFor={`po-date-${lineId}`} error={error("receivedOn")}><DatePicker className="[&>button]:h-11 [&>button]:rounded-lg" id={`po-date-${lineId}`} name="receivedOn" label="Receipt date" defaultValue={today} allowClear={false} required /></FormField>}
    <FormField label="Price variance reason" htmlFor={`po-reason-${lineId}`} error={error("costVarianceReason")} className="sm:col-span-2" hint="Only needed if the cost differs from the purchase order."><input id={`po-reason-${lineId}`} name="costVarianceReason" className={fieldControlClass} maxLength={500} /></FormField>
    {state.message && <p role="alert" className="text-sm text-red-700 sm:col-span-2">{state.message}</p>}
    <div className="sm:col-span-2"><RecordFormControls busy={pending} label="Record delivery" /></div>
  </form>;
}

// Quantity-only receipt: the stock cost comes from the PO price, which is not shown.
export function ReceiveWarehouseDeliveryForm({ orderId, lineId, remaining, unitSymbol, idempotencyKey, inspection }: { orderId: string; lineId: string; remaining: number; unitSymbol: string; idempotencyKey: string; inspection: AcceptedInspection }) {
  const [state, action, pending] = useActionState(receiveWarehouseDeliveryAction, initialState);
  const error = (field: string) => state.fieldErrors?.[field]?.[0];
  return <form action={action} className="grid gap-4 sm:grid-cols-2">
    <input type="hidden" name="orderId" value={orderId} /><input type="hidden" name="lineId" value={lineId} /><input type="hidden" name="idempotencyKey" value={idempotencyKey} />
    <FormField label={`Quantity received (${unitSymbol})`} htmlFor={`delivery-quantity-${inspection.id}`} error={error("quantity")} hint={`Up to ${remaining} ${unitSymbol} still expected`}><input id={`delivery-quantity-${inspection.id}`} name="quantity" inputMode="decimal" className={fieldControlClass} defaultValue={String(inspection.accepted_quantity)} readOnly required /></FormField>
    <FormField label="Delivery receipt number" htmlFor={`delivery-reference-${inspection.id}`} error={error("deliveryReference")}><input id={`delivery-reference-${inspection.id}`} name="deliveryReference" className={fieldControlClass} maxLength={120} defaultValue={inspection.delivery_reference} readOnly required /></FormField>
    <input type="hidden" name="receivedOn" value={inspection.inspected_on} /><p className="self-center text-sm text-slate-600">Inspected {inspection.inspected_on}{inspection.quality_note ? ` · ${inspection.quality_note}` : ""}</p>
    {state.message && <p role="alert" className="text-sm text-red-700 sm:col-span-2">{state.message}</p>}
    <div className="sm:col-span-2"><RecordFormControls busy={pending} label="Add to inventory" /></div>
  </form>;
}

export function CancelPurchaseOrderForm({ orderId }: { orderId: string }) {
  const [state, action, pending] = useActionState(cancelPurchaseOrderAction, initialState);
  return <form action={action} className="space-y-3"><input type="hidden" name="orderId" value={orderId} /><FormField label="Cancellation reason" htmlFor="cancelPoReason" error={state.fieldErrors?.reason?.[0]}><input id="cancelPoReason" name="reason" className={fieldControlClass} minLength={3} maxLength={500} required /></FormField>{state.message && <p role="alert" className="text-xs text-red-700">{state.message}</p>}<Button type="submit" variant="outline" size="sm" disabled={pending}>{pending ? "Cancelling…" : "Cancel order"}</Button></form>;
}

// How a purchase was paid, as in the client's sheet: cash, or a check (often
// postdated) with bank, check number, amount and date.
export function RecordSupplierPaymentForm({ orderId, balance, idempotencyKey, today }: { orderId: string; balance: number; idempotencyKey: string; today: string }) {
  const [state, action, pending] = useActionState(recordSupplierPaymentAction, initialState);
  const formId = useId();
  const fieldId = (field: string) => `${formId}-${field}`;
  const [method, setMethod] = useState<"cash" | "check">("check");
  const error = (field: string) => state.fieldErrors?.[field]?.[0];
  return <form action={action} className="grid gap-4 sm:grid-cols-2">
    <input type="hidden" name="orderId" value={orderId} /><input type="hidden" name="idempotencyKey" value={idempotencyKey} /><input type="hidden" name="method" value={method} />
    <FormField label="Term" htmlFor={fieldId("paymentMethod")} className="sm:col-span-2"><SelectPicker id={fieldId("paymentMethod")} label="Term" value={method} onValueChange={(next) => setMethod(next as "cash" | "check")} options={[{ value: "check", label: "Check (postdated or dated)" }, { value: "cash", label: "Cash" }]} /></FormField>
    {method === "check" && <>
      <FormField label="Bank" htmlFor={fieldId("bankName")} error={error("bankName")}><input id={fieldId("bankName")} name="bankName" className={fieldControlClass} maxLength={80} placeholder="e.g. Metrobank" required /></FormField>
      <FormField label="Check no." htmlFor={fieldId("checkNumber")} error={error("checkNumber")}><input id={fieldId("checkNumber")} name="checkNumber" className={fieldControlClass} maxLength={40} placeholder="e.g. 123456" required /></FormField>
    </>}
    <FormField label="Amount (PHP)" htmlFor={fieldId("paymentAmount")} error={error("amount")} hint={`Unpaid balance ${peso.format(balance)}`}><input id={fieldId("paymentAmount")} name="amount" inputMode="decimal" className={fieldControlClass} defaultValue={balance > 0 ? balance.toFixed(2) : ""} required /></FormField>
    <FormField label={method === "check" ? "Check date" : "Payment date"} htmlFor={fieldId("paymentDate")} error={error("paymentDate")}><DatePicker className="[&>button]:h-11 [&>button]:rounded-lg" id={fieldId("paymentDate")} name="paymentDate" label={method === "check" ? "Check date" : "Payment date"} defaultValue={today} allowClear={false} required /></FormField>
    <FormField label="Note (optional)" htmlFor={fieldId("paymentRemarks")} className="sm:col-span-2" error={error("remarks")}><input id={fieldId("paymentRemarks")} name="remarks" className={fieldControlClass} maxLength={500} /></FormField>
    {state.message && <p role="alert" className="text-sm text-red-700 sm:col-span-2">{state.message}</p>}
    <div className="sm:col-span-2"><RecordFormControls busy={pending} disabled={balance <= 0} label="Save payment" /></div>
  </form>;
}

export function VoidSupplierPaymentForm({ orderId, paymentId }: { orderId: string; paymentId: string }) {
  const [state, action, pending] = useActionState(voidSupplierPaymentAction, initialState);
  return <form action={action} className="grid gap-3">
    <input type="hidden" name="orderId" value={orderId} /><input type="hidden" name="paymentId" value={paymentId} />
    <FormField label="Reason" htmlFor={`void-reason-${paymentId}`} error={state.fieldErrors?.reason?.[0]}><input id={`void-reason-${paymentId}`} name="reason" className={fieldControlClass} maxLength={500} placeholder="e.g. Wrong amount entered" required /></FormField>
    {state.message && <p role="alert" className="text-sm text-red-700">{state.message}</p>}
    <RecordFormControls busy={pending} label="Void payment" />
  </form>;
}
