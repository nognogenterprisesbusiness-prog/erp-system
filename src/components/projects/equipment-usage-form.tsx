"use client";

import { useActionState, useEffect, useRef, useState } from "react";
import { postEquipmentUsageAction, type ProjectCostActionState } from "@/app/(workspace)/projects/[id]/costs/actions";
import { Button } from "@/components/ui/button";
import { DatePicker } from "@/components/ui/date-picker";
import { FormField, fieldControlClass } from "@/components/ui/form-field";
import { SelectPicker } from "@/components/ui/select-picker";
import { assetChoiceLabel } from "@nognog/domain";
import type { AssetKind } from "@/types/database";

export type EquipmentChoice = { id: string; code: string; name: string; kind?: AssetKind; rate?: { hourly_rate: number; effective_start_date: string; effective_end_date: string | null } };

export function EquipmentUsageForm({ projectId, assets, initialKey, today, showRates = false }: { projectId: string; assets: EquipmentChoice[]; initialKey: string; today: string; showRates?: boolean }) {
  const initialState: ProjectCostActionState = { message: "" };
  const [state, action, pending] = useActionState(postEquipmentUsageAction, initialState);
  const [assetId, setAssetId] = useState(assets[0]?.id ?? "");
  const keyInput = useRef<HTMLInputElement>(null);
  useEffect(() => { if (state.ok && keyInput.current) keyInput.current.value = crypto.randomUUID(); }, [state]);
  const options = assets.map((asset) => ({ value: asset.id, label: `${assetChoiceLabel(asset)}${showRates ? asset.rate ? ` · ₱${asset.rate.hourly_rate}/h` : " · no rate" : ""}` }));
  return <form action={action} className="space-y-4">
    <input ref={keyInput} type="hidden" name="idempotencyKey" defaultValue={initialKey} /><input type="hidden" name="projectId" value={projectId} /><input type="hidden" name="assetId" value={assetId} />
    <FormField label="Equipment or vehicle at this project site" htmlFor="usageAsset" error={state.fieldErrors?.assetId?.[0]}><SelectPicker label="Equipment or vehicle" value={assetId} onValueChange={setAssetId} options={options} placeholder="Choose equipment or vehicle" /></FormField>
    <FormField label="Use date" htmlFor="useDate" error={state.fieldErrors?.useDate?.[0]}><DatePicker id="useDate" name="useDate" label="Use date" defaultValue={today} maxDate={today} allowClear={false} required /></FormField>
    <FormField label="Hours used" htmlFor="usageHours" error={state.fieldErrors?.hours?.[0]}><input id="usageHours" name="hours" className={fieldControlClass} inputMode="decimal" placeholder="8.00" required /></FormField>
    <FormField label="Work note" htmlFor="usageNote" error={state.fieldErrors?.workNote?.[0]}><input id="usageNote" name="workNote" className={fieldControlClass} minLength={3} maxLength={500} placeholder="Work or trips performed" required /></FormField>
    {state.message && <p role={state.ok ? "status" : "alert"} className={`text-xs ${state.ok ? "text-emerald-700" : "text-red-700"}`}>{state.message}</p>}
    <Button type="submit" disabled={pending || !assets.length}>{pending ? "Recording…" : "Record equipment hours"}</Button>
  </form>;
}
