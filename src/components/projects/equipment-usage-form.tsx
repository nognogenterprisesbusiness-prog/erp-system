"use client";

import { displayMoney } from "@/lib/ui/display";
import { Button } from "@/components/ui/button";
import { IntentLink as Link } from "@/components/layout/intent-link";
import { useActionState, useState } from "react";
import { postEquipmentUsageAction, type ProjectCostActionState } from "@/app/(workspace)/projects/[id]/costs/actions";
import { RecordFormControls } from "@/components/ui/record-create-dialog";
import { DatePicker } from "@/components/ui/date-picker";
import { FormField, fieldControlClass } from "@/components/ui/form-field";
import { SelectPicker } from "@/components/ui/select-picker";
import { assetChoiceLabel } from "@nognog/domain";
import type { AssetKind } from "@/types/database";
import { RecordPhotoInput } from "@/components/ui/record-photo-input";

export type EquipmentChoice = { id: string; code: string; name: string; kind?: AssetKind; rate?: { hourly_rate: number; effective_start_date: string; effective_end_date: string | null } };

export function EquipmentUsageForm({ projectId, assets, initialKey, today, showRates = false }: { projectId: string; assets: EquipmentChoice[]; initialKey: string; today: string; showRates?: boolean }) {
  const initialState: ProjectCostActionState = { message: "" };
  const [assetId, setAssetId] = useState("");
  const [commandKey, setCommandKey] = useState(initialKey);
  const [hours, setHours] = useState("");
  const [workNote, setWorkNote] = useState("");
  const [startFile, setStartFile] = useState<File | null>(null);
  const [endFile, setEndFile] = useState<File | null>(null);
  const [startProcessing, setStartProcessing] = useState(false);
  const [endProcessing, setEndProcessing] = useState(false);
  const [evidenceKey, setEvidenceKey] = useState(0);
  const [state, action, pending] = useActionState(async (previous: ProjectCostActionState, form: FormData) => {
    if (startFile) form.set("startPhoto", startFile);
    if (endFile) form.set("endPhoto", endFile);
    const result = await postEquipmentUsageAction(previous, form);
    if (result.ok) {
      setCommandKey(crypto.randomUUID()); setHours(""); setWorkNote("");
      setStartFile(null); setEndFile(null); setEvidenceKey((key) => key + 1);
    }
    return result;
  }, initialState);
  const options = assets.map((asset) => ({ value: asset.id, label: `${assetChoiceLabel(asset)}${showRates ? asset.rate ? ` · ${displayMoney(asset.rate.hourly_rate)}/h` : " · no rate" : ""}` }));
  if (!assets.length) return <div className="space-y-4"><p className="text-sm leading-6 text-slate-600">No equipment or vehicle is assigned to an active site in this project. Review the existing equipment assignments before recording hours.</p><Button variant="outline" asChild><Link href="/equipment">View equipment</Link></Button></div>;
  return <form action={action} className="space-y-4">
    <input type="hidden" name="idempotencyKey" value={commandKey} /><input type="hidden" name="projectId" value={projectId} /><input type="hidden" name="assetId" value={assetId} />
    <FormField label="Equipment or vehicle at this project site" htmlFor="usageAsset" error={state.fieldErrors?.assetId?.[0]}><SelectPicker id="usageAsset" disabled={pending} label="Equipment or vehicle" value={assetId} onValueChange={setAssetId} options={options} placeholder="Choose equipment or vehicle" /></FormField>
    <FormField label="Use date" htmlFor="useDate" error={state.fieldErrors?.useDate?.[0]}><DatePicker id="useDate" name="useDate" label="Use date" defaultValue={today} maxDate={today} allowClear={false} required /></FormField>
    <FormField label="Hours used" htmlFor="usageHours" error={state.fieldErrors?.hours?.[0]}><input id="usageHours" name="hours" value={hours} onChange={(event) => setHours(event.target.value)} disabled={pending} className={fieldControlClass} inputMode="decimal" placeholder="8.00" required /></FormField>
    <FormField label="Work note" htmlFor="usageNote" error={state.fieldErrors?.workNote?.[0]}><input id="usageNote" name="workNote" value={workNote} onChange={(event) => setWorkNote(event.target.value)} disabled={pending} className={fieldControlClass} minLength={3} maxLength={500} placeholder="Work or trips performed" required /></FormField>
    <div key={evidenceKey} className="grid gap-3 sm:grid-cols-2">
      <RecordPhotoInput label="Start photo" inputName="startPhoto" convertBeforeSubmit forceConvert required={!startFile} disabled={pending || startProcessing} onPreparedFile={setStartFile} onProcessingChange={setStartProcessing} />
      <RecordPhotoInput label="After photo" inputName="endPhoto" convertBeforeSubmit forceConvert required={!endFile} disabled={pending || endProcessing} onPreparedFile={setEndFile} onProcessingChange={setEndProcessing} />
    </div>
    {state.message && <p role={state.ok ? "status" : "alert"} className={`text-xs ${state.ok ? "text-emerald-700" : "text-red-700"}`}>{state.message}</p>}
    <RecordFormControls busy={pending || startProcessing || endProcessing} disabled={!startFile || !endFile} label={startProcessing || endProcessing ? "Preparing photos" : "Record equipment hours"} />
  </form>;
}
