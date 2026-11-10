"use client";

import { useActionState, useState } from "react";
import { postAdditionalExpenseAction, reverseProjectCostAction, setEquipmentRateAction, type ProjectCostActionState } from "@/app/(workspace)/projects/[id]/costs/actions";
import { EquipmentUsageForm, type EquipmentChoice } from "./equipment-usage-form";
import { DatePicker } from "@/components/ui/date-picker";
import { FormField, fieldControlClass } from "@/components/ui/form-field";
import { SelectPicker } from "@/components/ui/select-picker";
import { RecordCreateDialog, RecordFormControls } from "@/components/ui/record-create-dialog";
import { assetChoiceLabel } from "@nognog/domain";

const initialState: ProjectCostActionState = { message: "" };

export function ProjectCostForms({ projectId, assets, keys, today }: { projectId: string; assets: EquipmentChoice[]; keys: { usage: string; expense: string }; today: string }) {
  return <section aria-label="Record project costs" className="mt-6 rounded-2xl border border-slate-200 bg-white p-5">
    <h2 className="text-base font-semibold">Record a project cost</h2><p className="mt-1 text-sm text-slate-500">Choose what you need to record. Existing entries stay in the history below.</p>
    <div className="mt-4 flex flex-wrap gap-3">
      <RecordCreateDialog title="Record equipment or vehicle use" triggerLabel="Record equipment use" triggerVariant="outline"><p className="mb-4 text-sm text-slate-500">Record actual hours used at this project site. The cost uses the approved hourly rate.</p><EquipmentUsageForm projectId={projectId} assets={assets} initialKey={keys.usage} today={today} showRates /></RecordCreateDialog>
      <RecordCreateDialog title="Add project expense" triggerLabel="Add project expense" triggerVariant="outline"><AdditionalExpenseForm projectId={projectId} initialKey={keys.expense} today={today} /></RecordCreateDialog>
      <RecordCreateDialog title="Set equipment or vehicle hourly rate" triggerLabel="Set hourly rate" triggerVariant="outline"><EquipmentRateForm projectId={projectId} assets={assets} today={today} /></RecordCreateDialog>
    </div>
  </section>;
}

function EquipmentRateForm({ projectId, assets, today }: { projectId: string; assets: EquipmentChoice[]; today: string }) {
  const [rateState, rateAction, ratePending] = useActionState(setEquipmentRateAction, initialState);
  const [rateAssetId, setRateAssetId] = useState(assets[0]?.id ?? "");
  const options = assets.map((asset) => ({ value: asset.id, label: `${assetChoiceLabel(asset)}${asset.rate ? ` · ₱${asset.rate.hourly_rate}/h` : " · no current rate"}` }));
  if (!assets.length) return <p className="text-sm leading-6 text-slate-600">Assign equipment or a vehicle to an active site in this project first. You can then set its hourly project charge here.</p>;
  return <form action={rateAction} className="space-y-4">
      <input type="hidden" name="projectId" value={projectId} /><input type="hidden" name="assetId" value={rateAssetId} />
      <FormField label="Equipment or vehicle" htmlFor="rateAsset" error={rateState.fieldErrors?.assetId?.[0]}><SelectPicker id="rateAsset" label="Equipment or vehicle" disabled={ratePending} value={rateAssetId} onValueChange={setRateAssetId} options={options} placeholder="Choose equipment or vehicle" /></FormField>
      <FormField label="Hourly project charge (PHP)" htmlFor="hourlyRate" error={rateState.fieldErrors?.hourlyRate?.[0]}><input id="hourlyRate" name="hourlyRate" className={fieldControlClass} inputMode="decimal" placeholder="0.00" required /></FormField>
      <FormField label="Effective from" htmlFor="effectiveOn" error={rateState.fieldErrors?.effectiveOn?.[0]}><DatePicker id="effectiveOn" name="effectiveOn" label="Effective from" defaultValue={today} allowClear={false} required /></FormField>
      <p className="text-xs leading-5 text-slate-500">Posted equipment costs keep their original hourly rate. This rate is used for new hour entries covered by its effective date.</p>
      {rateState.message && <p role="alert" className="text-xs text-red-700">{rateState.message}</p>}<RecordFormControls busy={ratePending} disabled={!assets.length} label="Save hourly rate" />
    </form>;
}

function AdditionalExpenseForm({ projectId, initialKey, today }: { projectId: string; initialKey: string; today: string }) {
  const [expenseState, expenseAction, expensePending] = useActionState(postAdditionalExpenseAction, initialState);
  const [category, setCategory] = useState("permit");
  return <form action={expenseAction} className="space-y-4">
      <input type="hidden" name="idempotencyKey" value={initialKey} /><input type="hidden" name="projectId" value={projectId} /><input type="hidden" name="category" value={category} />
      <FormField label="Category" htmlFor="expenseCategory" error={expenseState.fieldErrors?.category?.[0]}><SelectPicker id="expenseCategory" label="Expense category" disabled={expensePending} value={category} onValueChange={setCategory} options={[{ value: "permit", label: "Permit" }, { value: "subcontract", label: "Subcontract" }, { value: "utilities", label: "Utilities" }, { value: "other", label: "Other external expense" }]} /></FormField>
      <FormField label="Expense date" htmlFor="expenseDate" error={expenseState.fieldErrors?.expenseDate?.[0]}><DatePicker id="expenseDate" name="expenseDate" label="Expense date" defaultValue={today} allowClear={false} required /></FormField>
      <FormField label="Description" htmlFor="expenseDescription" error={expenseState.fieldErrors?.description?.[0]}><input id="expenseDescription" name="description" minLength={3} className={fieldControlClass} maxLength={500} required /></FormField>
      <FormField label="Receipt / external reference" htmlFor="externalReference" error={expenseState.fieldErrors?.externalReference?.[0]}><input id="externalReference" name="externalReference" minLength={3} className={fieldControlClass} maxLength={120} required /></FormField>
      <FormField label="Amount (PHP)" htmlFor="expenseAmount" error={expenseState.fieldErrors?.amount?.[0]}><input id="expenseAmount" name="amount" className={fieldControlClass} inputMode="decimal" required /></FormField>
      <p className="text-xs text-slate-500">Material use, attendance and equipment hours already create project costs. Use this form for permits, utilities, subcontract work or another external expense.</p>
      {expenseState.message && <p role="alert" className="text-xs text-red-700">{expenseState.message}</p>}<RecordFormControls busy={expensePending} label="Post project expense" />
    </form>;
}

export function ReverseCostForm({ projectId, kind, entryId, idempotencyKey }: { projectId: string; kind: "equipment" | "expense"; entryId: string; idempotencyKey: string }) {
  const [state, action, pending] = useActionState(reverseProjectCostAction, initialState);
  return <form action={action} className="space-y-3"><input type="hidden" name="idempotencyKey" value={idempotencyKey} /><input type="hidden" name="projectId" value={projectId} /><input type="hidden" name="kind" value={kind} /><input type="hidden" name="entryId" value={entryId} /><FormField label="Correction reason" htmlFor={`reverse-${entryId}`} error={state.fieldErrors?.reason?.[0]}><input id={`reverse-${entryId}`} name="reason" className={fieldControlClass} minLength={3} maxLength={500} disabled={pending} required /></FormField>{state.message && <p role="alert" className="text-xs text-red-700">{state.message}</p>}<RecordFormControls busy={pending} label="Reverse this entry" /></form>;
}
