"use client";

import { PlusSignIcon, Remove01Icon } from "@hugeicons/core-free-icons";
import { HugeiconsIcon } from "@hugeicons/react";
import { moneyInputSchema, quantitySchema } from "@nognog/domain";
import { Button } from "@/components/ui/button";
import { fieldControlClass } from "@/components/ui/form-field";
import { SelectPicker } from "@/components/ui/select-picker";

export type PurchaseLineInput = { key: number; materialId: string; quantity: string; unitPrice: string };
export type PurchaseMaterialChoice = { id: string; name: string; unitSymbol: string };

const peso = new Intl.NumberFormat("en-PH", { style: "currency", currency: "PHP" });
const lineGridClass = "grid min-w-0 grid-cols-2 items-end gap-3 sm:grid-cols-[minmax(0,1.7fr)_minmax(6rem,0.8fr)_minmax(7.5rem,0.95fr)_minmax(5.5rem,auto)_2.75rem]";
const lockedLineGridClass = "grid min-w-0 grid-cols-2 items-end gap-3 sm:grid-cols-[minmax(0,1.7fr)_minmax(6rem,0.8fr)_minmax(7.5rem,0.95fr)_minmax(5.5rem,auto)]";

export function isValidPurchaseQuantity(value: string) {
  return quantitySchema.safeParse(value).success;
}

export function isValidPurchaseUnitPrice(value: string) {
  return moneyInputSchema.safeParse(value).success;
}

export function PurchaseLineItems({ title = "Items", totalLabel = "Total", lines, materials, maxLines, pending, locked = false, idPrefix, onAdd, onRemove, onUpdate }: {
  title?: string;
  totalLabel?: string;
  lines: PurchaseLineInput[];
  materials: PurchaseMaterialChoice[];
  maxLines: number;
  pending: boolean;
  locked?: boolean;
  idPrefix: string;
  onAdd: () => void;
  onRemove: (key: number) => void;
  onUpdate: (key: number, patch: Partial<PurchaseLineInput>) => void;
}) {
  const materialById = new Map(materials.map((item) => [item.id, item]));
  return <section aria-label={title}>
    <div className="flex items-center justify-between gap-3"><h2 className="text-base font-semibold text-slate-900">{title}</h2>{!locked && <Button type="button" variant="outline" size="sm" className="h-11 rounded-full px-3 text-sm" disabled={lines.length >= maxLines || pending} onClick={onAdd}><HugeiconsIcon icon={PlusSignIcon} size={16} />Add item</Button>}</div>
    <div className="mt-3 space-y-3">
      {lines.map((line, index) => <fieldset key={line.key} className="min-w-0 rounded-lg border border-slate-200 p-3">
      <legend className="px-1 text-xs font-semibold text-slate-600">Item {index + 1}</legend>
      <div className={locked ? lockedLineGridClass : lineGridClass}>
        <div className="col-span-2 min-w-0 sm:col-span-1"><label htmlFor={`${idPrefix}-material-${line.key}`} className="mb-2 block text-sm font-medium text-slate-700">Material</label><SelectPicker id={`${idPrefix}-material-${line.key}`} className="h-11" label={`Material for item ${index + 1}`} value={line.materialId} disabled={locked || pending} onValueChange={(materialId) => onUpdate(line.key, { materialId })} options={materials.map((item) => ({ value: item.id, label: `${item.name} (${item.unitSymbol})`, disabled: lines.some((other) => other.key !== line.key && other.materialId === item.id) }))} placeholder="Select material" /></div>
        <div className="min-w-0"><label htmlFor={`${idPrefix}-quantity-${line.key}`} className="mb-2 block text-sm font-medium text-slate-700">Quantity{line.materialId ? ` (${materialById.get(line.materialId)?.unitSymbol ?? ""})` : ""}</label><input id={`${idPrefix}-quantity-${line.key}`} className={fieldControlClass} inputMode="decimal" value={line.quantity} readOnly={locked} disabled={pending} onChange={(event) => onUpdate(line.key, { quantity: event.target.value })} placeholder="e.g. 100" required /></div>
        <div className="min-w-0"><label htmlFor={`${idPrefix}-price-${line.key}`} className="mb-2 text-sm block font-medium text-slate-700">Unit price (PHP)</label><input id={`${idPrefix}-price-${line.key}`} className={fieldControlClass} inputMode="decimal" value={line.unitPrice} readOnly={locked} disabled={pending} onChange={(event) => onUpdate(line.key, { unitPrice: event.target.value })} placeholder="e.g. 150.00" required /></div>
        <div className="col-span-2 min-w-0 sm:col-span-1"><p className="mb-2 text-sm font-medium text-slate-700">Line total</p><output aria-label={`Item ${index + 1} total`} className="flex h-11 min-w-0 items-center truncate text-sm font-semibold tabular-nums text-slate-900">{peso.format(lineTotal(line))}</output></div>
        {!locked && <Button type="button" variant="outline" size="sm" className="col-span-2 h-11 w-full rounded-full px-3 text-xs sm:col-span-1 sm:w-11 sm:px-0" aria-label={`Remove item ${index + 1}`} title={`Remove item ${index + 1}`} disabled={lines.length === 1 || pending} onClick={() => onRemove(line.key)}><HugeiconsIcon icon={Remove01Icon} size={16} /><span className="sm:sr-only">Remove</span></Button>}
      </div>
    </fieldset>)}
    </div>
    <p className="mt-3 text-xs leading-5 text-slate-500">Choose a material, enter the quantity in its unit and the price for one unit, e.g. 100 bags at 150.00 each.</p><div className="mt-3 flex justify-end gap-4 text-sm"><span className="text-slate-500">{totalLabel}</span><span className="font-semibold tabular-nums text-slate-900">{peso.format(lines.reduce((sum, line) => sum + lineTotal(line), 0))}</span></div>
    {lines.some((line) => !line.materialId || !isValidPurchaseQuantity(line.quantity) || !isValidPurchaseUnitPrice(line.unitPrice)) && <p className="mt-2 text-xs text-slate-500">Complete each line with a material, a positive quantity, and a positive price to save.</p>}
  </section>;
}

function lineTotal(line: PurchaseLineInput) {
  const value = Number(line.quantity) * Number(line.unitPrice);
  return Number.isFinite(value) ? Math.round(value * 100) / 100 : 0;
}
