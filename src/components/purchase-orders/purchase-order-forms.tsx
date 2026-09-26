"use client";

import { useActionState, useState } from "react";
import { PlusSignIcon, Remove01Icon } from "@hugeicons/core-free-icons";
import { HugeiconsIcon } from "@hugeicons/react";
import { cancelPurchaseOrderAction, issuePurchaseOrderAction, receivePurchaseOrderLineAction, type PurchaseActionState } from "@/app/(workspace)/purchase-orders/actions";
import { Button } from "@/components/ui/button";
import { DatePicker } from "@/components/ui/date-picker";
import { FormField, fieldControlClass } from "@/components/ui/form-field";
import { SelectPicker } from "@/components/ui/select-picker";
import { RecordFormControls } from "@/components/ui/record-create-dialog";
import type { getPurchaseOrderChoices } from "@/lib/data/purchase-orders";

type Choices = Awaited<ReturnType<typeof getPurchaseOrderChoices>>;
type Line = { key: number; supplierMaterialId: string; quantity: string };
const initialState: PurchaseActionState = { message: "" };

export function IssuePurchaseOrderForm({ choices, idempotencyKey, today, initialMaterialId, initialWarehouseId, initialQuantity }: { choices: Choices; idempotencyKey: string; today: string; initialMaterialId?: string; initialWarehouseId?: string; initialQuantity?: string }) {
  const [state, action, pending] = useActionState(issuePurchaseOrderAction, initialState);
  const initialCatalogItem = choices.catalog.find((item) => item.materialId === initialMaterialId);
  const [supplierId, setSupplierId] = useState(initialCatalogItem?.supplierId ?? choices.suppliers[0]?.id ?? "");
  const [warehouseId, setWarehouseId] = useState(initialWarehouseId ?? choices.warehouses[0]?.id ?? "");
  const [lines, setLines] = useState<Line[]>([{ key: 0, supplierMaterialId: initialCatalogItem?.id ?? "", quantity: initialQuantity ?? "" }]);
  const [nextKey, setNextKey] = useState(1);
  const [orderedOn, setOrderedOn] = useState(today);
  const money = new Intl.NumberFormat("en-PH", { style: "currency", currency: "PHP" });
  const priceFor = (id: string) => choices.prices.find((price) => price.supplier_material_id === id && price.effective_start_date <= orderedOn && (!price.effective_end_date || price.effective_end_date >= orderedOn));
  const catalog = choices.catalog.filter((item) => item.supplierId === supplierId);
  const error = (field: string) => state.fieldErrors?.[field]?.[0];
  const updateLine = (key: number, patch: Partial<Line>) => setLines((current) => current.map((line) => line.key === key ? { ...line, ...patch } : line));
  return <form action={action} className="rounded-xl border border-slate-200 bg-white p-5 sm:p-6">
    <input type="hidden" name="idempotencyKey" value={idempotencyKey} />
    <input type="hidden" name="supplierId" value={supplierId} /><input type="hidden" name="warehouseId" value={warehouseId} />
    <input type="hidden" name="lines" value={JSON.stringify(lines.map(({ supplierMaterialId, quantity }) => ({ supplierMaterialId, quantity })))} />
    <div className="grid gap-5 md:grid-cols-2">
      <FormField label="Supplier" htmlFor="poSupplier" error={error("supplierId")}><SelectPicker className="h-11" label="Supplier" value={supplierId} onValueChange={(next) => { setSupplierId(next); setLines([{ key: 0, supplierMaterialId: "", quantity: "" }]); }} options={choices.suppliers.map((item) => ({ value: item.id, label: `${item.code} · ${item.supplier_name}` }))} /></FormField>
      <FormField label="Receiving warehouse" htmlFor="poWarehouse" error={error("warehouseId")}><SelectPicker className="h-11" label="Receiving warehouse" value={warehouseId} onValueChange={setWarehouseId} options={choices.warehouses.map((item) => ({ value: item.id, label: `${item.code} · ${item.name}` }))} /></FormField>
      <FormField label="Purchase date" htmlFor="orderedOn" error={error("orderedOn")}><DatePicker className="[&>button]:h-11 [&>button]:rounded-lg" id="orderedOn" name="orderedOn" label="Purchase date" value={orderedOn} onValueChange={setOrderedOn} allowClear={false} required /></FormField>
      <FormField label="Expected delivery" htmlFor="expectedOn" error={error("expectedOn")}><DatePicker className="[&>button]:h-11 [&>button]:rounded-lg" id="expectedOn" name="expectedOn" label="Expected delivery" defaultValue={today} allowClear={false} required /></FormField>
      <FormField label="Purpose" htmlFor="purpose" error={error("purpose")} className="md:col-span-2"><textarea id="purpose" name="purpose" rows={2} maxLength={500} className={`${fieldControlClass} h-auto py-3`} placeholder="Replenish warehouse material stock" required /></FormField>
    </div>
    <div className="mt-7 flex items-center justify-between gap-3"><div><h2 className="text-base font-semibold text-slate-900">Materials & prices</h2><p className="mt-1 text-xs text-slate-500">Saved supplier prices are captured on purchase. Record actual delivery cost when receiving.</p></div><Button type="button" variant="outline" size="sm" disabled={lines.length >= 20 || pending} onClick={() => { setLines((current) => [...current, { key: nextKey, supplierMaterialId: "", quantity: "" }]); setNextKey((value) => value + 1); }}><HugeiconsIcon icon={PlusSignIcon} size={16} /> Add material</Button></div>
    <div className="mt-4 grid gap-3">{lines.map((line, index) => <div key={line.key} className="grid gap-3 rounded-lg border border-slate-200 p-3 sm:grid-cols-[minmax(0,1fr)_100px_120px_auto] sm:items-end">
      <FormField label={`Material ${index + 1}`} htmlFor={`po-material-${line.key}`}><SelectPicker className="h-11" label={`Material ${index + 1}`} value={line.supplierMaterialId} onValueChange={(supplierMaterialId) => updateLine(line.key, { supplierMaterialId })} options={catalog.map((item) => ({ value: item.id, label: `${item.code} · ${item.name} (min ${item.minimumQuantity})`, disabled: lines.some((other) => other.key !== line.key && other.supplierMaterialId === item.id) }))} placeholder="Select supplier SKU" /></FormField>
      <FormField label="Quantity" htmlFor={`po-quantity-${line.key}`}><input id={`po-quantity-${line.key}`} className={fieldControlClass} inputMode="decimal" value={line.quantity} onChange={(event) => updateLine(line.key, { quantity: event.target.value })} placeholder="0.0000" required /></FormField>
      <div><p className="mb-2 text-sm font-medium text-slate-700">Unit price</p><p className="flex h-11 items-center text-sm tabular-nums">{priceFor(line.supplierMaterialId) ? money.format(Number(priceFor(line.supplierMaterialId)?.unit_price)) : "Not available"}</p></div>
      <Button type="button" variant="ghost" size="icon" aria-label={`Remove material ${index + 1}`} disabled={lines.length === 1 || pending} onClick={() => setLines((current) => current.filter((item) => item.key !== line.key))}><HugeiconsIcon icon={Remove01Icon} size={17} /></Button>
    </div>)}</div>
    {error("lines") && <p role="alert" className="mt-2 text-xs text-red-700">{error("lines")}</p>}
    {state.message && <p role="alert" className="mt-5 text-sm text-red-700">{state.message}</p>}
    {!catalog.length && supplierId && <p role="status" className="mt-4 rounded-lg border border-amber-200 bg-amber-50 p-3 text-sm text-amber-900">Add an available supplier material and active PHP price before issuing this order.</p>}
    <RecordFormControls busy={pending} disabled={!supplierId || !warehouseId || !catalog.length || lines.some((line) => !line.supplierMaterialId || !line.quantity)} label="Save purchase" />
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
    <FormField label="Actual goods cost (PHP)" htmlFor={`po-cost-${lineId}`} error={error("goodsTotalCost")} hint="Use the delivery's actual material cost; no freight or VAT is allocated automatically."><input id={`po-cost-${lineId}`} name="goodsTotalCost" inputMode="decimal" className={fieldControlClass} value={cost} onChange={(event) => setCost(event.target.value)} required /></FormField>
    <FormField label="Delivery reference" htmlFor={`po-delivery-${lineId}`} error={error("deliveryReference")}><input id={`po-delivery-${lineId}`} name="deliveryReference" className={fieldControlClass} maxLength={120} placeholder="DR-12345" required /></FormField>
    <FormField label="Receipt date" htmlFor={`po-date-${lineId}`} error={error("receivedOn")}><DatePicker className="[&>button]:h-11 [&>button]:rounded-lg" id={`po-date-${lineId}`} name="receivedOn" label="Receipt date" defaultValue={today} allowClear={false} required /></FormField>
    <FormField label="Price variance reason" htmlFor={`po-reason-${lineId}`} error={error("costVarianceReason")} className="sm:col-span-2" hint="Required if actual goods cost differs from ordered quantity × PO unit price."><input id={`po-reason-${lineId}`} name="costVarianceReason" className={fieldControlClass} maxLength={500} /></FormField>
    {state.message && <p role="alert" className="text-sm text-red-700 sm:col-span-2">{state.message}</p>}
    <div className="sm:col-span-2"><RecordFormControls busy={pending} label="Record delivery" /></div>
  </form>;
}

export function CancelPurchaseOrderForm({ orderId }: { orderId: string }) {
  const [state, action, pending] = useActionState(cancelPurchaseOrderAction, initialState);
  return <form action={action} className="space-y-3"><input type="hidden" name="orderId" value={orderId} /><FormField label="Cancellation reason" htmlFor="cancelPoReason" error={state.fieldErrors?.reason?.[0]}><input id="cancelPoReason" name="reason" className={fieldControlClass} minLength={3} maxLength={500} required /></FormField>{state.message && <p role="alert" className="text-xs text-red-700">{state.message}</p>}<Button type="submit" variant="outline" size="sm" disabled={pending}>{pending ? "Cancelling…" : "Cancel order"}</Button></form>;
}
