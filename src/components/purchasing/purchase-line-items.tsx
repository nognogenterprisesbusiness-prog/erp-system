"use client";

import { PlusSignIcon, Remove01Icon } from "@hugeicons/core-free-icons";
import { HugeiconsIcon } from "@hugeicons/react";
import { moneyInputSchema, quantitySchema } from "@nognog/domain";
import { Button } from "@/components/ui/button";
import { FormField, fieldControlClass } from "@/components/ui/form-field";
import { SelectPicker } from "@/components/ui/select-picker";

export type PurchaseLineInput = { key: number; materialId: string; quantity: string; unitPrice: string };
export type PurchaseMaterialChoice = { id: string; name: string; unitSymbol: string };

const peso = new Intl.NumberFormat("en-PH", { style: "currency", currency: "PHP" });

export function isValidPurchaseQuantity(value: string) {
  return quantitySchema.safeParse(value).success;
}

export function isValidPurchaseUnitPrice(value: string) {
  return moneyInputSchema.safeParse(value).success;
}

export function PurchaseLineItems({ title = "Items", totalLabel = "Total", lines, materials, maxLines, pending, idPrefix, onAdd, onRemove, onUpdate }: {
  title?: string;
  totalLabel?: string;
  lines: PurchaseLineInput[];
  materials: PurchaseMaterialChoice[];
  maxLines: number;
  pending: boolean;
  idPrefix: string;
  onAdd: () => void;
  onRemove: (key: number) => void;
  onUpdate: (key: number, patch: Partial<PurchaseLineInput>) => void;
}) {
  const materialById = new Map(materials.map((item) => [item.id, item]));
  return <section aria-label={title}>
    <div className="flex items-center justify-between gap-3"><h2 className="text-base font-semibold text-slate-900">{title}</h2><Button type="button" variant="outline" size="sm" className="h-11 rounded-lg px-3 text-sm" disabled={lines.length >= maxLines || pending} onClick={onAdd}><HugeiconsIcon icon={PlusSignIcon} size={16} />Add item</Button></div>
    <div className="mt-3 grid gap-3">{lines.map((line, index) => <fieldset key={line.key} className="min-w-0 rounded-lg border border-slate-200 p-3">
      <legend className="px-1 text-xs font-semibold text-slate-600">Item {index + 1}</legend>
      <div className="grid min-w-0 grid-cols-2 items-end gap-3 sm:grid-cols-[minmax(0,1.7fr)_minmax(6rem,0.8fr)_minmax(7.5rem,0.95fr)_minmax(5.5rem,auto)_auto]">
        <FormField label="Material" htmlFor={`${idPrefix}-material-${line.key}`} className="col-span-2 min-w-0 sm:col-span-1"><SelectPicker id={`${idPrefix}-material-${line.key}`} className="h-11" label={`Material for item ${index + 1}`} value={line.materialId} onValueChange={(materialId) => onUpdate(line.key, { materialId })} options={materials.map((item) => ({ value: item.id, label: `${item.name} (${item.unitSymbol})`, disabled: lines.some((other) => other.key !== line.key && other.materialId === item.id) }))} placeholder="Select material" /></FormField>
        <FormField label={`Quantity${line.materialId ? ` (${materialById.get(line.materialId)?.unitSymbol ?? ""})` : ""}`} htmlFor={`${idPrefix}-quantity-${line.key}`} className="min-w-0"><input id={`${idPrefix}-quantity-${line.key}`} className={fieldControlClass} inputMode="decimal" value={line.quantity} onChange={(event) => onUpdate(line.key, { quantity: event.target.value })} placeholder="0" required /></FormField>
        <FormField label="Unit price (PHP)" htmlFor={`${idPrefix}-price-${line.key}`} className="min-w-0"><input id={`${idPrefix}-price-${line.key}`} className={fieldControlClass} inputMode="decimal" value={line.unitPrice} onChange={(event) => onUpdate(line.key, { unitPrice: event.target.value })} placeholder="0.00" required /></FormField>
        <div className="col-span-2 min-w-0 sm:col-span-1"><p className="mb-2 text-sm font-medium text-slate-700">Line total</p><output aria-label={`Item ${index + 1} total`} className="flex h-11 min-w-0 items-center truncate text-sm font-semibold tabular-nums text-slate-900">{peso.format(lineTotal(line))}</output></div>
        <Button type="button" variant="outline" size="sm" className="col-span-2 h-11 rounded-lg px-3 text-xs sm:col-span-1" aria-label={`Remove item ${index + 1}`} disabled={lines.length === 1 || pending} onClick={() => onRemove(line.key)}><HugeiconsIcon icon={Remove01Icon} size={16} />Remove</Button>
      </div>
    </fieldset>)}</div>
    <div className="mt-3 flex justify-end gap-4 text-sm"><span className="text-slate-500">{totalLabel}</span><span className="font-semibold tabular-nums text-slate-900">{peso.format(lines.reduce((sum, line) => sum + lineTotal(line), 0))}</span></div>
    {lines.some((line) => !line.materialId || !isValidPurchaseQuantity(line.quantity) || !isValidPurchaseUnitPrice(line.unitPrice)) && <p className="mt-2 text-xs text-slate-500">Complete each line with a material, a positive quantity, and a positive price to save.</p>}
  </section>;
}

function lineTotal(line: PurchaseLineInput) {
  const value = Number(line.quantity) * Number(line.unitPrice);
  return Number.isFinite(value) ? Math.round(value * 100) / 100 : 0;
}
