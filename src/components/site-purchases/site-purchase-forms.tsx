"use client";

import { useActionState, useState } from "react";
import { PlusSignIcon, Remove01Icon } from "@hugeicons/core-free-icons";
import { HugeiconsIcon } from "@hugeicons/react";
import { approveSitePurchaseAction, reimburseSitePurchaseAction, rejectSitePurchaseAction, submitSitePurchaseAction, type SitePurchaseActionState } from "@/app/(workspace)/site-purchases/actions";
import { Button } from "@/components/ui/button";
import { DatePicker } from "@/components/ui/date-picker";
import { FormField, fieldControlClass } from "@/components/ui/form-field";
import { RecordFormControls } from "@/components/ui/record-create-dialog";
import { RecordPhotoInput } from "@/components/ui/record-photo-input";
import { SelectPicker } from "@/components/ui/select-picker";
import type { getSitePurchaseChoices } from "@/lib/data/site-purchases";

type Choices = Awaited<ReturnType<typeof getSitePurchaseChoices>>;
type Line = { key: number; materialId: string; quantity: string; unitPrice: string };
const initialState: SitePurchaseActionState = { message: "" };
const peso = new Intl.NumberFormat("en-PH", { style: "currency", currency: "PHP" });
const lineTotal = (line: Line) => {
  const value = Number(line.quantity) * Number(line.unitPrice);
  return Number.isFinite(value) ? Math.round(value * 100) / 100 : 0;
};
const NEW_STORE = "__new__";

// The Engineer records what was bought at the hardware store, like the receipt.
export function SitePurchaseForm({ choices, idempotencyKey, today }: { choices: Choices; idempotencyKey: string; today: string }) {
  const [state, action, pending] = useActionState(submitSitePurchaseAction, initialState);
  const [siteId, setSiteId] = useState(choices.sites.length === 1 ? choices.sites[0].id : "");
  const [store, setStore] = useState("");
  const [paidWith, setPaidWith] = useState("company_cash");
  const [lines, setLines] = useState<Line[]>([{ key: 0, materialId: "", quantity: "", unitPrice: "" }]);
  const [nextKey, setNextKey] = useState(1);
  const [processingPhoto, setProcessingPhoto] = useState(false);
  const site = choices.sites.find((item) => item.id === siteId);
  const units = new Map(choices.materials.map((material) => [material.id, material.unitSymbol]));
  const total = lines.reduce((sum, line) => sum + lineTotal(line), 0);
  const error = (field: string) => state.fieldErrors?.[field]?.[0];
  const updateLine = (key: number, patch: Partial<Line>) => setLines((current) => current.map((line) => line.key === key ? { ...line, ...patch } : line));
  return <form action={action} className="space-y-6">
    <input type="hidden" name="idempotencyKey" value={idempotencyKey} />
    <input type="hidden" name="siteId" value={siteId} /><input type="hidden" name="projectId" value={site?.projectId ?? ""} />
    <input type="hidden" name="supplierId" value={store === NEW_STORE ? "" : store} /><input type="hidden" name="paidWith" value={paidWith} />
    <input type="hidden" name="lines" value={JSON.stringify(lines.map(({ materialId, quantity, unitPrice }) => ({ materialId, quantity, unitPrice })))} />
    <div className="grid gap-4 md:grid-cols-2">
      <FormField label="Project site" htmlFor="spSite" error={error("siteId")}><SelectPicker id="spSite" label="Project site" value={siteId} onValueChange={setSiteId} placeholder="Choose the site" options={choices.sites.map((item) => ({ value: item.id, label: item.label }))} /></FormField>
      <FormField label="Hardware store" htmlFor="spStore" error={error("supplierId")}><SelectPicker id="spStore" label="Hardware store" value={store} onValueChange={setStore} placeholder="Choose the store" options={[...choices.suppliers.map((item) => ({ value: item.id, label: item.supplier_name })), { value: NEW_STORE, label: "+ New store" }]} /></FormField>
      {store === NEW_STORE && <>
        <FormField label="Store name" htmlFor="newSupplierName"><input id="newSupplierName" name="newSupplierName" className={fieldControlClass} maxLength={160} placeholder="e.g. City Hardware" required /></FormField>
        <FormField label="Contact number" htmlFor="newSupplierContact"><input id="newSupplierContact" name="newSupplierContact" className={fieldControlClass} maxLength={40} inputMode="tel" required /></FormField>
        <FormField label="Store address" htmlFor="newSupplierAddress" className="md:col-span-2"><input id="newSupplierAddress" name="newSupplierAddress" className={fieldControlClass} maxLength={300} required /></FormField>
      </>}
      <FormField label="Receipt no." htmlFor="receiptNumber" error={error("receiptNumber")}><input id="receiptNumber" name="receiptNumber" className={fieldControlClass} maxLength={80} placeholder="e.g. OR-1001" required /></FormField>
      <FormField label="Receipt date" htmlFor="receiptDate" error={error("receiptDate")}><DatePicker className="[&>button]:h-11 [&>button]:rounded-lg" id="receiptDate" name="receiptDate" label="Receipt date" defaultValue={today} allowClear={false} required /></FormField>
    </div>
    <div>
      <div className="flex items-center justify-between gap-3"><h3 className="text-sm font-semibold text-slate-900">Items bought</h3><Button type="button" variant="outline" size="sm" disabled={lines.length >= 30 || pending} onClick={() => { setLines((current) => [...current, { key: nextKey, materialId: "", quantity: "", unitPrice: "" }]); setNextKey((key) => key + 1); }}><HugeiconsIcon icon={PlusSignIcon} size={16} /> Add item</Button></div>
      <div className="mt-3 grid gap-3">{lines.map((line, index) => <div key={line.key} className="grid gap-3 rounded-lg border border-slate-200 p-3 sm:grid-cols-[minmax(0,1fr)_110px_120px_120px_auto] sm:items-end">
        <FormField label={`Item ${index + 1}`} htmlFor={`sp-material-${line.key}`}><SelectPicker label={`Item ${index + 1}`} value={line.materialId} onValueChange={(materialId) => updateLine(line.key, { materialId })} placeholder="Select item" options={choices.materials.map((item) => ({ value: item.id, label: `${item.name} (${item.unitSymbol})`, disabled: lines.some((other) => other.key !== line.key && other.materialId === item.id) }))} /></FormField>
        <FormField label={`Quantity${line.materialId ? ` (${units.get(line.materialId) ?? ""})` : ""}`} htmlFor={`sp-quantity-${line.key}`}><input id={`sp-quantity-${line.key}`} className={fieldControlClass} inputMode="decimal" value={line.quantity} onChange={(event) => updateLine(line.key, { quantity: event.target.value })} placeholder="0" required /></FormField>
        <FormField label="Price (PHP)" htmlFor={`sp-price-${line.key}`}><input id={`sp-price-${line.key}`} className={fieldControlClass} inputMode="decimal" value={line.unitPrice} onChange={(event) => updateLine(line.key, { unitPrice: event.target.value })} placeholder="0.00" required /></FormField>
        <div><p className="mb-2 text-sm font-medium text-slate-700">Total</p><p className="flex h-11 items-center text-sm font-semibold tabular-nums">{peso.format(lineTotal(line))}</p></div>
        <Button type="button" variant="ghost" size="icon" aria-label={`Remove item ${index + 1}`} disabled={lines.length === 1 || pending} onClick={() => setLines((current) => current.filter((item) => item.key !== line.key))}><HugeiconsIcon icon={Remove01Icon} size={17} /></Button>
      </div>)}</div>
      <div className="mt-3 flex justify-end text-sm"><span className="text-slate-500">Receipt total</span><span className="ml-4 font-semibold tabular-nums text-slate-900">{peso.format(total)}</span></div>
      {error("lines") && <p role="alert" className="mt-2 text-xs text-red-700">{error("lines")}</p>}
    </div>
    <div className="grid gap-4 md:grid-cols-2">
      <FormField label="Paid with" htmlFor="paidWith"><SelectPicker id="paidWith" label="Paid with" value={paidWith} onValueChange={setPaidWith} options={[{ value: "company_cash", label: "Company cash" }, { value: "own_money", label: "Own money (to reimburse)" }]} /></FormField>
      <FormField label="Note (optional)" htmlFor="spNotes" error={error("notes")}><input id="spNotes" name="notes" className={fieldControlClass} maxLength={500} /></FormField>
      <div className="md:col-span-2"><RecordPhotoInput label="Receipt photo" required convertBeforeSubmit onProcessingChange={setProcessingPhoto} />{error("photo") && <p className="mt-1 text-xs text-red-600">{error("photo")}</p>}</div>
    </div>
    {state.message && <p role="alert" className="text-sm text-red-700">{state.message}</p>}
    <RecordFormControls busy={pending || processingPhoto} disabled={!siteId || !store || lines.some((line) => !line.materialId || !line.quantity || !line.unitPrice)} label="Submit for approval" />
  </form>;
}

export function ApproveSitePurchaseForm({ purchaseId, total }: { purchaseId: string; total: number }) {
  const [state, action, pending] = useActionState(approveSitePurchaseAction, initialState);
  return <form action={action} className="space-y-3">
    <input type="hidden" name="purchaseId" value={purchaseId} />
    <p className="text-sm text-slate-600">Approving adds the items to the site&apos;s stock at the receipt prices ({peso.format(total)}) and saves them as the store&apos;s latest prices.</p>
    {state.message && <p role="alert" className="text-sm text-red-700">{state.message}</p>}
    <RecordFormControls busy={pending} label="Approve purchase" />
  </form>;
}

export function RejectSitePurchaseForm({ purchaseId }: { purchaseId: string }) {
  const [state, action, pending] = useActionState(rejectSitePurchaseAction, initialState);
  return <form action={action} className="space-y-3">
    <input type="hidden" name="purchaseId" value={purchaseId} />
    <FormField label="Reason" htmlFor="rejectReason" error={state.fieldErrors?.reason?.[0]}><input id="rejectReason" name="reason" className={fieldControlClass} maxLength={500} placeholder="e.g. Receipt does not match the items" required /></FormField>
    {state.message && <p role="alert" className="text-sm text-red-700">{state.message}</p>}
    <RecordFormControls busy={pending} label="Reject purchase" />
  </form>;
}

export function ReimburseSitePurchaseForm({ purchaseId, today }: { purchaseId: string; today: string }) {
  const [state, action, pending] = useActionState(reimburseSitePurchaseAction, initialState);
  return <form action={action} className="grid gap-4 sm:grid-cols-2">
    <input type="hidden" name="purchaseId" value={purchaseId} />
    <FormField label="Date reimbursed" htmlFor="reimbursedOn" error={state.fieldErrors?.reimbursedOn?.[0]}><DatePicker className="[&>button]:h-11 [&>button]:rounded-lg" id="reimbursedOn" name="reimbursedOn" label="Date reimbursed" defaultValue={today} allowClear={false} required /></FormField>
    <FormField label="Reference" htmlFor="reimburseReference" error={state.fieldErrors?.reference?.[0]}><input id="reimburseReference" name="reference" className={fieldControlClass} maxLength={120} placeholder="e.g. PCV-0001" required /></FormField>
    {state.message && <p role="alert" className="text-sm text-red-700 sm:col-span-2">{state.message}</p>}
    <div className="sm:col-span-2"><RecordFormControls busy={pending} label="Mark reimbursed" /></div>
  </form>;
}
