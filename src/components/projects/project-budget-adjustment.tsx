"use client";

import { useActionState, useState } from "react";
import { budgetChangeSchema } from "@nognog/domain";
import { adjustBudgetAction, type ProjectCostActionState } from "@/app/(workspace)/projects/[id]/costs/actions";
import { FormField, fieldControlClass } from "@/components/ui/form-field";
import { RecordCreateDialog, RecordFormControls } from "@/components/ui/record-create-dialog";
import { SelectPicker } from "@/components/ui/select-picker";

const money = new Intl.NumberFormat("en-PH", { style: "currency", currency: "PHP" });
export function ProjectBudgetAdjustment(props: { projectId: string; budget: number; cost: number; initialKey: string; returnTo?: "finance" | "costs" }) {
  return <RecordCreateDialog title="Adjust approved budget" triggerLabel="Adjust approved budget" triggerIcon={null}>
    <BudgetForm {...props} />
  </RecordCreateDialog>;
}

function BudgetForm({ projectId, budget, cost, initialKey, returnTo = "costs" }: { projectId: string; budget: number; cost: number; initialKey: string; returnTo?: "finance" | "costs" }) {
  const [state, action, pending] = useActionState(adjustBudgetAction, { message: "" } as ProjectCostActionState);
  const [direction, setDirection] = useState("increase");
  const [amount, setAmount] = useState("");
  const changeAmount = `${direction === "reduce" ? "-" : ""}${amount.trim()}`;
  const valid = /^\d+(\.\d{1,2})?$/.test(amount.trim()) && budgetChangeSchema.shape.changeAmount.safeParse(changeAmount).success;
  const updated = Math.round((budget + Number(changeAmount)) * 100) / 100;
  const remaining = Math.round((updated - cost) * 100) / 100;
  return <form action={action} className="space-y-5">
    <input type="hidden" name="idempotencyKey" value={initialKey} /><input type="hidden" name="projectId" value={projectId} /><input type="hidden" name="changeAmount" value={changeAmount} /><input type="hidden" name="returnTo" value={returnTo} />
    <p className="text-sm leading-6 text-slate-600">Admin records a budget change that has been approved. This changes the project budget immediately and keeps the reason in its history.</p>
    <div className="rounded-xl bg-slate-50 p-4"><p className="text-xs text-slate-500">Current approved budget</p><p className="mt-1 text-xl font-semibold tabular-nums">{money.format(budget)}</p></div>
    <FormField label="What changed?" htmlFor="budgetDirection"><SelectPicker id="budgetDirection" label="Budget change type" value={direction} onValueChange={setDirection} disabled={pending} options={[{ value: "increase", label: "Increase the budget" }, { value: "reduce", label: "Reduce the budget" }]} /></FormField>
    <FormField label={direction === "reduce" ? "Amount to subtract (PHP)" : "Amount to add (PHP)"} htmlFor="budgetAmount" error={state.fieldErrors?.changeAmount?.[0]} hint="Enter a positive amount, for example 10000.00."><input id="budgetAmount" className={fieldControlClass} value={amount} onChange={(event) => setAmount(event.target.value)} inputMode="decimal" placeholder="0.00" disabled={pending} required /></FormField>
    {valid && <div aria-live="polite" className="grid gap-4 rounded-xl border border-cyan-100 bg-cyan-50 p-4 sm:grid-cols-2"><div><p className="text-xs text-slate-600">New approved budget</p><p className="mt-1 font-semibold tabular-nums">{money.format(updated)}</p></div><div><p className="text-xs text-slate-600">{remaining < 0 ? "Over budget after change" : "Remaining after actual costs"}</p><p className={`mt-1 font-semibold tabular-nums ${remaining < 0 ? "text-red-700" : ""}`}>{money.format(remaining)}</p></div></div>}
    {valid && updated < 0 && <p role="alert" className="text-sm text-red-700">The approved budget cannot be below ₱0.00. Reduce the amount to subtract.</p>}
    <FormField label="Reason for the approved change" htmlFor="budgetReason" error={state.fieldErrors?.reason?.[0]}><textarea id="budgetReason" name="reason" className={`${fieldControlClass} h-auto py-3`} rows={2} minLength={3} maxLength={500} placeholder="For example, approved additional second-floor work" disabled={pending} required /></FormField>
    {state.message && <p role="alert" className="text-sm text-red-700">{state.message}</p>}
    <RecordFormControls busy={pending} disabled={!valid || updated < 0} label="Save approved budget change" />
  </form>;
}
