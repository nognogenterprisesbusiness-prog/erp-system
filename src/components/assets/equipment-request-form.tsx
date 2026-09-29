"use client";

import { useActionState, useState } from "react";
import { submitEquipmentRequestAction, type EquipmentRequestActionState } from "@/app/(workspace)/equipment/requests/actions";
import { Button } from "@/components/ui/button";
import { DateRangePicker } from "@/components/ui/date-range-picker";
import { SelectPicker } from "@/components/ui/select-picker";
import { FormField, fieldControlClass } from "@/components/ui/form-field";
import { assetChoiceLabel } from "@nognog/domain";
import type { AssetKind } from "@/types/database";

const initialState: EquipmentRequestActionState = { ok: false, message: "" };

export function EquipmentRequestForm({ projectId, siteId, equipment, kind, initialAssetId = "" }: {
  projectId: string;
  siteId: string;
  kind: AssetKind;
  equipment: { asset_id: string; asset_code: string; asset_name: string; asset_kind: AssetKind }[];
  initialAssetId?: string;
}) {
  const [state, action, pending] = useActionState(submitEquipmentRequestAction, initialState);
  const [neededOn, setNeededOn] = useState("");
  const [returnOn, setReturnOn] = useState("");
  return <form action={action} className="mt-4 rounded-xl border border-slate-200 bg-white p-5">
    <input type="hidden" name="projectId" value={projectId} />
    <input type="hidden" name="siteId" value={siteId} />
    <h2 className="text-base font-semibold text-slate-900">Request {kind}</h2>
    <div className="mt-4 grid gap-4 lg:grid-cols-[1.5fr_1fr_1.5fr_auto] lg:items-end">
      <FormField label={kind === "vehicle" ? "Vehicle" : "Equipment"} htmlFor="assetId"><SelectPicker id="assetId" name="assetId" label={kind === "vehicle" ? "Vehicle" : "Equipment"} required defaultValue={equipment.some((item) => item.asset_id === initialAssetId) ? initialAssetId : undefined} options={equipment.map((item) => ({ value: item.asset_id, label: assetChoiceLabel({ code: item.asset_code, name: item.asset_name, kind: item.asset_kind }) }))} placeholder={`Select available ${kind}`} /></FormField>
      <DateRangePicker startDate={neededOn} endDate={returnOn} onStartChange={setNeededOn} onEndChange={setReturnOn} startName="neededOn" endName="expectedReturnOn" startLabel="Needed on" endLabel="Expected return" groupLabel={`${kind === "vehicle" ? "Vehicle" : "Equipment"} request dates`} />
      <FormField label="Purpose" htmlFor="purpose"><input id="purpose" name="purpose" required minLength={3} maxLength={500} className={fieldControlClass} placeholder="What work needs it?" /></FormField>
      <Button type="submit" disabled={pending || equipment.length === 0 || !neededOn || !returnOn}>{pending ? "Submitting…" : "Submit request"}</Button>
    </div>
    {equipment.length === 0 && <p className="mt-3 text-sm text-slate-500">No available {kind === "vehicle" ? "vehicles" : "equipment"} at this site or its linked warehouses.</p>}
    {state.message && <p role="alert" className="mt-3 text-sm text-red-600">{state.message}</p>}
  </form>;
}
