"use client";

import { RecordFormControls } from "@/components/ui/record-create-dialog";
import { SelectPicker } from "@/components/ui/select-picker";
import { MoneyInput } from "@/components/ui/money-input";
import { useActionState, useState } from "react";
import { assetExpenseLabels } from "@nognog/domain";
import { Button } from "@/components/ui/button";
import { fieldControlClass } from "@/components/ui/form-field";
import { addAssetExpense, assignDriverTruck, reverseAssetExpense, type ExpenseActionState } from "./asset-expense-actions";

const initialState: ExpenseActionState = { message: "" };
const labelClass = "grid gap-1 text-sm font-medium";

function Feedback({ state }: { state: ExpenseActionState }) {
  if (!state.message) return null;
  return <p role={state.success ? "status" : "alert"} className={state.success ? "text-sm text-emerald-800" : "text-sm text-red-700"}>{state.message}</p>;
}

export function AddAssetExpenseForm({ assetId, initialKey, today }: { assetId: string; initialKey: string; today: string }) {
  // The request key stays the same across retries of one entry and changes only after a confirmed save.
  const [key, setKey] = useState(initialKey);
  const [state, action, pending] = useActionState(async (previous: ExpenseActionState, form: FormData) => {
    const next = await addAssetExpense(previous, form);
    if (next.success) setKey(crypto.randomUUID());
    return next;
  }, initialState);
  return <form action={action} className="mt-3 grid gap-3">
    <input type="hidden" name="assetId" value={assetId} />
    <input type="hidden" name="requestId" value={key} />
    <fieldset key={key} disabled={pending} className="grid gap-3 sm:grid-cols-2">
      <label className={labelClass}>Category<select name="category" className={fieldControlClass} required defaultValue="fuel">
        {Object.entries(assetExpenseLabels).map(([value, label]) => <option key={value} value={value}>{label}</option>)}
      </select></label>
      <label className={labelClass}>Amount (PHP)<MoneyInput name="amount" inputMode="decimal" required maxLength={13} className={fieldControlClass} /></label>
      <label className={labelClass}>Date<input name="expenseDate" type="date" required max={today} defaultValue={today} className={fieldControlClass} /></label>
      <label className={labelClass}>Notes (optional)<input name="notes" maxLength={500} className={fieldControlClass} /></label>
    </fieldset>
    <Feedback state={state} />
    <RecordFormControls busy={pending} success={state.success} label="Save expense" />
  </form>;
}

export function ReverseAssetExpenseForm({ assetId, expenseId }: { assetId: string; expenseId: string }) {
  const [state, action, pending] = useActionState(reverseAssetExpense, initialState);
  return <form action={action} className="mt-3 grid gap-2">
    <input type="hidden" name="assetId" value={assetId} />
    <input type="hidden" name="expenseId" value={expenseId} />
    <label className={labelClass}>Correction reason<input name="reason" className={fieldControlClass} required minLength={3} maxLength={500} /></label>
    <Feedback state={state} />
    <RecordFormControls busy={pending} success={state.success} label="Remove expense from totals" />
  </form>;
}

export function DriverTruckForm({ driverId, current, vehicles }: { driverId: string; current?: string; vehicles: { id: string; label: string }[] }) {
  const [state, action, pending] = useActionState(assignDriverTruck, initialState);
  const [selection, setSelection] = useState(current ?? "");
  return <form action={action} className="grid gap-3">
    <input type="hidden" name="driverId" value={driverId} />
    <label className={labelClass}>Assigned truck<select name="assetId" className={fieldControlClass} value={selection} onChange={(event) => setSelection(event.target.value)}>
      <option value="">No assignment</option>
      {vehicles.map((vehicle) => <option key={vehicle.id} value={vehicle.id}>{vehicle.label}</option>)}
    </select></label>
    <Feedback state={state} />
    <div><Button type="submit" disabled={pending}>{pending ? "Saving…" : "Save assignment"}</Button></div>
  </form>;
}

export function AddVehicleDriverForm({ assetId, drivers }: { assetId: string; drivers: { id: string; name: string; currentTruck?: string }[] }) {
  const [state, action, pending] = useActionState(assignDriverTruck, initialState);
  const [driverId, setDriverId] = useState("");
  const selected = drivers.find(driver => driver.id === driverId);
  return <form action={action} className="mt-5 grid gap-4">
    <input type="hidden" name="assetId" value={assetId} />
    <label className={labelClass}>Driver<SelectPicker label="Driver" name="driverId" value={driverId} onValueChange={setDriverId} placeholder="Choose a driver" disabled={pending} required options={drivers.map(driver => ({ value: driver.id, label: driver.name }))} /></label>
    {selected && <p className="rounded-lg bg-slate-50 p-3 text-sm leading-6 text-slate-600">{selected.currentTruck ? `This driver is currently assigned to ${selected.currentTruck}. Saving moves them to this truck.` : "This driver has no truck assigned."} Other drivers assigned here stay on this truck.</p>}
    <Feedback state={state} />
    <RecordFormControls busy={pending} success={state.success} disabled={!driverId} label="Assign driver" />
  </form>;
}
