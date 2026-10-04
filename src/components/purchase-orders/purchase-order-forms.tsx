"use client";

import { useActionState, useState } from "react";
import { PlusSignIcon, Remove01Icon } from "@hugeicons/core-free-icons";
import { HugeiconsIcon } from "@hugeicons/react";
import { cancelPurchaseOrderAction, issuePurchaseOrderAction, receivePurchaseOrderLineAction, receiveWarehouseDeliveryAction, recordSupplierPaymentAction, voidSupplierPaymentAction, type PurchaseActionState } from "@/app/(workspace)/purchase-orders/actions";
import { Button } from "@/components/ui/button";
import { DatePicker } from "@/components/ui/date-picker";
import { FormField, fieldControlClass } from "@/components/ui/form-field";
import { SelectPicker } from "@/components/ui/select-picker";
import { RecordFormControls } from "@/components/ui/record-create-dialog";
import type { getPurchaseOrderChoices } from "@/lib/data/purchase-orders";

type Choices = Awaited<ReturnType<typeof getPurchaseOrderChoices>>;
type Line = { key: number; materialId: string; quantity: string; unitPrice: string };
const initialState: PurchaseActionState = { message: "" };
const peso = new Intl.NumberFormat("en-PH", { style: "currency", currency: "PHP" });
const lineTotal = (line: Line) => {
  const value = Number(line.quantity) * Number(line.unitPrice);
  return Number.isFinite(value) ? Math.round(value * 100) / 100 : 0;
};

// Purchase like the client's sheet: supplier, warehouse, date, then item,
// quantity and price per line. The price starts at the supplier's latest price.
export function IssuePurchaseOrderForm({ choices, idempotencyKey, today, initialMaterialId, initialWarehouseId, initialQuantity }: { choices: Choices; idempotencyKey: string; today: string; initialMaterialId?: string; initialWarehouseId?: string; initialQuantity?: string }) {
  const [state, action, pending] = useActionState(issuePurchaseOrderAction, initialState);
  const [supplierId, setSupplierId] = useState(choices.suppliers[0]?.id ?? "");
  const [warehouseId, setWarehouseId] = useState(initialWarehouseId ?? choices.warehouses[0]?.id ?? "");
  const latestPrice = (supplier: string, materialId: string) => {
    const price = choices.latestPrices[`${supplier}:${materialId}`];
    return price === undefined ? "" : price.toFixed(2);
  };
  const [lines, setLines] = useState<Line[]>([{ key: 0, materialId: initialMaterialId ?? "", quantity: initialQuantity ?? "", unitPrice: initialMaterialId ? latestPrice(supplierId, initialMaterialId) : "" }]);
  const [nextKey, setNextKey] = useState(1);
  const materialById = new Map(choices.materials.map((material) => [material.id, material]));
  const total = lines.reduce((sum, line) => sum + lineTotal(line), 0);
  const error = (field: string) => state.fieldErrors?.[field]?.[0];
  const updateLine = (key: number, patch: Partial<Line>) => setLines((current) => current.map((line) => line.key === key ? { ...line, ...patch } : line));
  const changeSupplier = (next: string) => {
    setSupplierId(next);
    // Refill prices the user has not typed over with the new supplier's latest price.
    setLines((current) => current.map((line) => line.materialId && line.unitPrice === latestPrice(supplierId, line.materialId) ? { ...line, unitPrice: latestPrice(next, line.materialId) } : line));
  };
  return <form action={action} className="rounded-xl border border-slate-200 bg-white p-5 sm:p-6">
    <input type="hidden" name="idempotencyKey" value={idempotencyKey} />
    <input type="hidden" name="supplierId" value={supplierId} /><input type="hidden" name="warehouseId" value={warehouseId} />
    <input type="hidden" name="lines" value={JSON.stringify(lines.map(({ materialId, quantity, unitPrice }) => ({ materialId, quantity, unitPrice })))} />
    <div className="grid gap-5 md:grid-cols-3">
      <FormField label="Supplier" htmlFor="poSupplier" error={error("supplierId")}><SelectPicker className="h-11" label="Supplier" value={supplierId} onValueChange={changeSupplier} options={choices.suppliers.map((item) => ({ value: item.id, label: item.supplier_name }))} /></FormField>
      <FormField label="Deliver to warehouse" htmlFor="poWarehouse" error={error("warehouseId")}><SelectPicker className="h-11" label="Deliver to warehouse" value={warehouseId} onValueChange={setWarehouseId} options={choices.warehouses.map((item) => ({ value: item.id, label: item.name }))} /></FormField>
      <FormField label="Purchase date" htmlFor="orderedOn" error={error("orderedOn")}><DatePicker className="[&>button]:h-11 [&>button]:rounded-lg" id="orderedOn" name="orderedOn" label="Purchase date" defaultValue={today} allowClear={false} required /></FormField>
    </div>
    <div className="mt-7 flex items-center justify-between gap-3"><h2 className="text-base font-semibold text-slate-900">Items</h2><Button type="button" variant="outline" size="sm" disabled={lines.length >= 50 || pending} onClick={() => { setLines((current) => [...current, { key: nextKey, materialId: "", quantity: "", unitPrice: "" }]); setNextKey((value) => value + 1); }}><HugeiconsIcon icon={PlusSignIcon} size={16} /> Add item</Button></div>
    <div className="mt-3 grid gap-3">{lines.map((line, index) => <div key={line.key} className="grid gap-3 rounded-lg border border-slate-200 p-3 sm:grid-cols-[minmax(0,1fr)_120px_130px_130px_auto] sm:items-end">
      <FormField label={`Item ${index + 1}`} htmlFor={`po-material-${line.key}`}><SelectPicker className="h-11" label={`Item ${index + 1}`} value={line.materialId} onValueChange={(materialId) => updateLine(line.key, { materialId, unitPrice: line.unitPrice || latestPrice(supplierId, materialId) })} options={choices.materials.map((item) => ({ value: item.id, label: `${item.name} (${item.unitSymbol})`, disabled: lines.some((other) => other.key !== line.key && other.materialId === item.id) }))} placeholder="Select item" /></FormField>
      <FormField label={`Quantity${line.materialId ? ` (${materialById.get(line.materialId)?.unitSymbol ?? ""})` : ""}`} htmlFor={`po-quantity-${line.key}`}><input id={`po-quantity-${line.key}`} className={fieldControlClass} inputMode="decimal" value={line.quantity} onChange={(event) => updateLine(line.key, { quantity: event.target.value })} placeholder="0" required /></FormField>
      <FormField label="Price (PHP)" htmlFor={`po-price-${line.key}`}><input id={`po-price-${line.key}`} className={fieldControlClass} inputMode="decimal" value={line.unitPrice} onChange={(event) => updateLine(line.key, { unitPrice: event.target.value })} placeholder="0.00" required /></FormField>
      <div><p className="mb-2 text-sm font-medium text-slate-700">Total</p><p className="flex h-11 items-center text-sm font-semibold tabular-nums">{peso.format(lineTotal(line))}</p></div>
      <Button type="button" variant="ghost" size="icon" aria-label={`Remove item ${index + 1}`} disabled={lines.length === 1 || pending} onClick={() => setLines((current) => current.filter((item) => item.key !== line.key))}><HugeiconsIcon icon={Remove01Icon} size={17} /></Button>
    </div>)}</div>
    <div className="mt-3 flex justify-end text-sm"><span className="text-slate-500">Total</span><span className="ml-4 font-semibold tabular-nums text-slate-900">{peso.format(total)}</span></div>
    <details className="mt-4 rounded-lg border border-slate-200 p-3"><summary className="cursor-pointer text-sm font-medium text-slate-700">Expected delivery and notes (optional)</summary><div className="mt-3 grid gap-4 md:grid-cols-2">
      <FormField label="Expected delivery" htmlFor="expectedOn" error={error("expectedOn")}><DatePicker className="[&>button]:h-11 [&>button]:rounded-lg" id="expectedOn" name="expectedOn" label="Expected delivery" /></FormField>
      <FormField label="Notes" htmlFor="purpose" error={error("purpose")}><input id="purpose" name="purpose" maxLength={500} className={fieldControlClass} /></FormField>
    </div></details>
    {error("lines") && <p role="alert" className="mt-2 text-xs text-red-700">{error("lines")}</p>}
    {state.message && <p role="alert" className="mt-5 text-sm text-red-700">{state.message}</p>}
    <RecordFormControls busy={pending} disabled={!supplierId || !warehouseId || lines.some((line) => !line.materialId || !line.quantity || !line.unitPrice)} label="Save purchase" />
  </form>;
}

export function ReceivePurchaseLineForm({ orderId, lineId, remaining, unitPrice, unitSymbol, idempotencyKey, today }: { orderId: string; lineId: string; remaining: number; unitPrice: number; unitSymbol: string; idempotencyKey: string; today: string }) {
  const [state, action, pending] = useActionState(receivePurchaseOrderLineAction, initialState);
  const [quantity, setQuantity] = useState(String(remaining));
  const [cost, setCost] = useState((Math.round(remaining * unitPrice * 100) / 100).toFixed(2));
  const error = (field: string) => state.fieldErrors?.[field]?.[0];
  return <form action={action} className="grid gap-4 rounded-lg border border-slate-200 bg-slate-50 p-4 sm:grid-cols-2">
    <input type="hidden" name="orderId" value={orderId} /><input type="hidden" name="lineId" value={lineId} /><input type="hidden" name="idempotencyKey" value={idempotencyKey} />
    <FormField label={`Received quantity (${unitSymbol})`} htmlFor={`po-receive-quantity-${lineId}`} error={error("quantity")}><input id={`po-receive-quantity-${lineId}`} name="quantity" inputMode="decimal" className={fieldControlClass} value={quantity} onChange={(event) => { setQuantity(event.target.value); const next = Number(event.target.value); if (Number.isFinite(next)) setCost((Math.round(next * unitPrice * 100) / 100).toFixed(2)); }} required /></FormField>
    <FormField label="Actual goods cost (PHP)" htmlFor={`po-cost-${lineId}`} error={error("goodsTotalCost")} hint="Material cost on the delivery receipt, without freight or VAT."><input id={`po-cost-${lineId}`} name="goodsTotalCost" inputMode="decimal" className={fieldControlClass} value={cost} onChange={(event) => setCost(event.target.value)} required /></FormField>
    <FormField label="Delivery reference" htmlFor={`po-delivery-${lineId}`} error={error("deliveryReference")}><input id={`po-delivery-${lineId}`} name="deliveryReference" className={fieldControlClass} maxLength={120} placeholder="DR-12345" required /></FormField>
    <FormField label="Receipt date" htmlFor={`po-date-${lineId}`} error={error("receivedOn")}><DatePicker className="[&>button]:h-11 [&>button]:rounded-lg" id={`po-date-${lineId}`} name="receivedOn" label="Receipt date" defaultValue={today} allowClear={false} required /></FormField>
    <FormField label="Price variance reason" htmlFor={`po-reason-${lineId}`} error={error("costVarianceReason")} className="sm:col-span-2" hint="Only needed if the cost differs from the purchase order."><input id={`po-reason-${lineId}`} name="costVarianceReason" className={fieldControlClass} maxLength={500} /></FormField>
    {state.message && <p role="alert" className="text-sm text-red-700 sm:col-span-2">{state.message}</p>}
    <div className="sm:col-span-2"><RecordFormControls busy={pending} label="Record delivery" /></div>
  </form>;
}

// Quantity-only receipt: the stock cost comes from the PO price, which is not shown.
export function ReceiveWarehouseDeliveryForm({ orderId, lineId, remaining, unitSymbol, idempotencyKey, today }: { orderId: string; lineId: string; remaining: number; unitSymbol: string; idempotencyKey: string; today: string }) {
  const [state, action, pending] = useActionState(receiveWarehouseDeliveryAction, initialState);
  const error = (field: string) => state.fieldErrors?.[field]?.[0];
  return <form action={action} className="grid gap-4 sm:grid-cols-2">
    <input type="hidden" name="orderId" value={orderId} /><input type="hidden" name="lineId" value={lineId} /><input type="hidden" name="idempotencyKey" value={idempotencyKey} />
    <FormField label={`Quantity received (${unitSymbol})`} htmlFor={`delivery-quantity-${lineId}`} error={error("quantity")} hint={`Up to ${remaining} ${unitSymbol} still expected`}><input id={`delivery-quantity-${lineId}`} name="quantity" inputMode="decimal" className={fieldControlClass} defaultValue={String(remaining)} required /></FormField>
    <FormField label="Delivery receipt number" htmlFor={`delivery-reference-${lineId}`} error={error("deliveryReference")}><input id={`delivery-reference-${lineId}`} name="deliveryReference" className={fieldControlClass} maxLength={120} placeholder="DR-12345" required /></FormField>
    <FormField label="Date received" htmlFor={`delivery-date-${lineId}`} error={error("receivedOn")}><DatePicker className="[&>button]:h-11 [&>button]:rounded-lg" id={`delivery-date-${lineId}`} name="receivedOn" label="Date received" defaultValue={today} allowClear={false} required /></FormField>
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
  const [method, setMethod] = useState<"cash" | "check">("check");
  const error = (field: string) => state.fieldErrors?.[field]?.[0];
  return <form action={action} className="grid gap-4 sm:grid-cols-2">
    <input type="hidden" name="orderId" value={orderId} /><input type="hidden" name="idempotencyKey" value={idempotencyKey} /><input type="hidden" name="method" value={method} />
    <FormField label="Term" htmlFor="paymentMethod" className="sm:col-span-2"><SelectPicker id="paymentMethod" label="Term" value={method} onValueChange={(next) => setMethod(next as "cash" | "check")} options={[{ value: "check", label: "Check (postdated or dated)" }, { value: "cash", label: "Cash" }]} /></FormField>
    {method === "check" && <>
      <FormField label="Bank" htmlFor="bankName" error={error("bankName")}><input id="bankName" name="bankName" className={fieldControlClass} maxLength={80} placeholder="e.g. Metrobank" required /></FormField>
      <FormField label="Check no." htmlFor="checkNumber" error={error("checkNumber")}><input id="checkNumber" name="checkNumber" className={fieldControlClass} maxLength={40} placeholder="e.g. 123456" required /></FormField>
    </>}
    <FormField label="Amount (PHP)" htmlFor="paymentAmount" error={error("amount")} hint={`Unpaid balance ${peso.format(balance)}`}><input id="paymentAmount" name="amount" inputMode="decimal" className={fieldControlClass} defaultValue={balance > 0 ? balance.toFixed(2) : ""} required /></FormField>
    <FormField label={method === "check" ? "Check date" : "Payment date"} htmlFor="paymentDate" error={error("paymentDate")}><DatePicker className="[&>button]:h-11 [&>button]:rounded-lg" id="paymentDate" name="paymentDate" label={method === "check" ? "Check date" : "Payment date"} defaultValue={today} allowClear={false} required /></FormField>
    <FormField label="Note (optional)" htmlFor="paymentRemarks" className="sm:col-span-2" error={error("remarks")}><input id="paymentRemarks" name="remarks" className={fieldControlClass} maxLength={500} /></FormField>
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
