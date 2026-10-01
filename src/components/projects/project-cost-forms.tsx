"use client";

import { useActionState, useState } from "react";
import { adjustBudgetAction, postAdditionalExpenseAction, reverseProjectCostAction, setEquipmentRateAction, type ProjectCostActionState } from "@/app/(workspace)/projects/[id]/costs/actions";
import { EquipmentUsageForm, type EquipmentChoice } from "./equipment-usage-form";
import { Button } from "@/components/ui/button";
import { DatePicker } from "@/components/ui/date-picker";
import { FormField, fieldControlClass } from "@/components/ui/form-field";
import { SelectPicker } from "@/components/ui/select-picker";
import { assetChoiceLabel } from "@nognog/domain";

const initialState: ProjectCostActionState = { message: "" };

export function ProjectCostForms({ projectId, assets, keys, today }: { projectId: string; assets: EquipmentChoice[]; keys: { rate: string; usage: string; expense: string; budget: string }; today: string }) {
  const [rateState, rateAction, ratePending] = useActionState(setEquipmentRateAction, initialState);
  const [expenseState, expenseAction, expensePending] = useActionState(postAdditionalExpenseAction, initialState);
  const [budgetState, budgetAction, budgetPending] = useActionState(adjustBudgetAction, initialState);
  const [rateAssetId, setRateAssetId] = useState(assets[0]?.id ?? "");
  const [category, setCategory] = useState("permit");
  const options = assets.map((asset) => ({ value: asset.id, label: `${assetChoiceLabel(asset)}${asset.rate ? ` · ₱${asset.rate.hourly_rate}/h` : " · no rate"}` }));
  return <section className="mt-7 grid gap-3 sm:grid-cols-2">
    <details className="rounded-xl border border-slate-200 bg-white p-5"><summary className="cursor-pointer text-sm font-semibold text-slate-900">Record equipment or vehicle use</summary><div className="mt-5"><EquipmentUsageForm projectId={projectId} assets={assets} initialKey={keys.usage} today={today} showRates /></div></details>
    <details className="rounded-xl border border-slate-200 bg-white p-5"><summary className="cursor-pointer text-sm font-semibold text-slate-900">Set equipment or vehicle hourly rate</summary><form action={rateAction} className="mt-5 space-y-4">
      <input type="hidden" name="projectId" value={projectId} /><input type="hidden" name="assetId" value={rateAssetId} />
      <FormField label="Equipment or vehicle" htmlFor="rateAsset" error={rateState.fieldErrors?.assetId?.[0]}><SelectPicker label="Equipment or vehicle" value={rateAssetId} onValueChange={setRateAssetId} options={options} placeholder="Choose equipment or vehicle" /></FormField>
      <FormField label="Hourly management charge (PHP)" htmlFor="hourlyRate" error={rateState.fieldErrors?.hourlyRate?.[0]}><input id="hourlyRate" name="hourlyRate" className={fieldControlClass} inputMode="decimal" placeholder="0.00" required /></FormField>
      <FormField label="Effective from" htmlFor="effectiveOn" error={rateState.fieldErrors?.effectiveOn?.[0]}><DatePicker id="effectiveOn" name="effectiveOn" label="Effective from" defaultValue={today} allowClear={false} required /></FormField>
      {rateState.message && <p role="alert" className="text-xs text-red-700">{rateState.message}</p>}<Button type="submit" disabled={ratePending || !assets.length}>{ratePending ? "Saving…" : "Save rate"}</Button>
    </form></details>
    <details className="rounded-xl border border-slate-200 bg-white p-5"><summary className="cursor-pointer text-sm font-semibold text-slate-900">Add project expense</summary><form action={expenseAction} className="mt-5 space-y-4">
      <input type="hidden" name="idempotencyKey" value={keys.expense} /><input type="hidden" name="projectId" value={projectId} /><input type="hidden" name="category" value={category} />
      <FormField label="Category" htmlFor="expenseCategory" error={expenseState.fieldErrors?.category?.[0]}><SelectPicker label="Expense category" value={category} onValueChange={setCategory} options={[{ value: "permit", label: "Permit" }, { value: "subcontract", label: "Subcontract" }, { value: "utilities", label: "Utilities" }, { value: "other", label: "Other external expense" }]} /></FormField>
      <FormField label="Expense date" htmlFor="expenseDate" error={expenseState.fieldErrors?.expenseDate?.[0]}><DatePicker id="expenseDate" name="expenseDate" label="Expense date" defaultValue={today} allowClear={false} required /></FormField>
      <FormField label="Description" htmlFor="expenseDescription" error={expenseState.fieldErrors?.description?.[0]}><input id="expenseDescription" name="description" className={fieldControlClass} maxLength={500} required /></FormField>
      <FormField label="Receipt / external reference" htmlFor="externalReference" error={expenseState.fieldErrors?.externalReference?.[0]}><input id="externalReference" name="externalReference" className={fieldControlClass} maxLength={120} required /></FormField>
      <FormField label="Amount (PHP)" htmlFor="expenseAmount" error={expenseState.fieldErrors?.amount?.[0]}><input id="expenseAmount" name="amount" className={fieldControlClass} inputMode="decimal" required /></FormField>
      <p className="text-xs text-slate-500">Materials, labor and equipment are costed automatically. Add only other expenses here.</p>
      {expenseState.message && <p role="alert" className="text-xs text-red-700">{expenseState.message}</p>}<Button type="submit" disabled={expensePending}>{expensePending ? "Posting…" : "Post expense"}</Button>
    </form></details>
    <details className="rounded-xl border border-slate-200 bg-white p-5"><summary className="cursor-pointer text-sm font-semibold text-slate-900">Adjust approved budget</summary><form action={budgetAction} className="mt-5 space-y-4">
      <input type="hidden" name="idempotencyKey" value={keys.budget} /><input type="hidden" name="projectId" value={projectId} />
      <FormField label="Change amount (PHP)" htmlFor="changeAmount" error={budgetState.fieldErrors?.changeAmount?.[0]} hint="Use a negative amount to reduce the budget."><input id="changeAmount" name="changeAmount" className={fieldControlClass} inputMode="decimal" placeholder="10000.00 or -10000.00" required /></FormField>
      <FormField label="Approval reason" htmlFor="budgetReason" error={budgetState.fieldErrors?.reason?.[0]}><input id="budgetReason" name="reason" className={fieldControlClass} maxLength={500} required /></FormField>
      {budgetState.message && <p role="alert" className="text-xs text-red-700">{budgetState.message}</p>}<Button type="submit" disabled={budgetPending}>{budgetPending ? "Saving…" : "Approve budget change"}</Button>
    </form></details>
  </section>;
}

export function ReverseCostForm({ projectId, kind, entryId, idempotencyKey }: { projectId: string; kind: "equipment" | "expense"; entryId: string; idempotencyKey: string }) {
  const [state, action, pending] = useActionState(reverseProjectCostAction, initialState);
  return <form action={action} className="space-y-3"><input type="hidden" name="idempotencyKey" value={idempotencyKey} /><input type="hidden" name="projectId" value={projectId} /><input type="hidden" name="kind" value={kind} /><input type="hidden" name="entryId" value={entryId} /><FormField label="Correction reason" htmlFor={`reverse-${entryId}`} error={state.fieldErrors?.reason?.[0]}><input id={`reverse-${entryId}`} name="reason" className={fieldControlClass} minLength={3} maxLength={500} required /></FormField>{state.message && <p role="alert" className="text-xs text-red-700">{state.message}</p>}<Button type="submit" variant="outline" size="sm" disabled={pending}>{pending ? "Reversing…" : "Reverse entry"}</Button></form>;
}
