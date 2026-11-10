"use client";

import { useId, useState } from "react";
import { decideMaterialRequestSchema } from "@nognog/domain";
import { Button } from "@/components/ui/button";
import { fieldControlClass } from "@/components/ui/form-field";
import { useRecordDialog } from "@/components/ui/record-create-dialog";

export type StockSource = { request_line_id: string; warehouse_id: string; warehouse_name: string; on_hand: number; available: number };
export type WarehouseAllocation = { warehouseId: string; quantity: string };

export function WarehouseAllocationEditor({ sources, current, requested, unit, onApply }: {
  sources: StockSource[]; current: WarehouseAllocation[]; requested: number; unit: string;
  onApply: (allocations: WarehouseAllocation[]) => void;
}) {
  const dialog = useRecordDialog();
  const fieldPrefix = useId();
  const [quantities, setQuantities] = useState<Record<string, string>>(() => Object.fromEntries(sources.map((source) => [source.warehouse_id, current.find((item) => item.warehouseId === source.warehouse_id)?.quantity ?? "0"])));
  const total = Math.round(Object.values(quantities).reduce((sum, value) => sum + Number(value || 0), 0) * 10000) / 10000;
  const invalid = total > requested || sources.some((source) => !decideMaterialRequestSchema.shape.decisions.valueType.safeParse(quantities[source.warehouse_id]).success || Number(quantities[source.warehouse_id]) > source.available);
  return <div>
    <p className="text-sm text-slate-600">Requested: <strong>{requested} {unit}</strong>. Enter how much to take from each warehouse. Stock is reserved only when you approve the request.</p>
    <div className="mt-4 space-y-3">{sources.map((source) => <div key={source.warehouse_id} className="grid grid-cols-[1fr_120px] items-center gap-3 rounded-xl border border-slate-200 p-3">
      <div><p className="text-sm font-semibold">{source.warehouse_name}</p><p className="text-xs text-slate-500">{source.available} {unit} available</p></div>
      <div><label className="sr-only" htmlFor={`${fieldPrefix}-${source.warehouse_id}`}>Quantity from {source.warehouse_name} ({unit})</label><input id={`${fieldPrefix}-${source.warehouse_id}`} type="number" inputMode="decimal" min={0} max={Math.min(source.available, requested)} step="0.0001" value={quantities[source.warehouse_id]} onChange={(event) => setQuantities((previous) => ({ ...previous, [source.warehouse_id]: event.target.value }))} className={fieldControlClass} /></div>
    </div>)}</div>
    <p className={`mt-4 text-sm font-semibold ${invalid ? "text-amber-800" : "text-slate-900"}`}>Total to approve: {Number.isFinite(total) ? total : "—"} / {requested} {unit}</p>
    {invalid && <p role="alert" className="mt-2 text-sm text-amber-800">Use valid quantities within the available stock at each warehouse and the requested total.</p>}
    <div className="mt-5 flex justify-end"><Button type="button" disabled={invalid} onClick={() => {
      onApply(sources.flatMap((source) => Number(quantities[source.warehouse_id]) > 0 ? [{ warehouseId: source.warehouse_id, quantity: quantities[source.warehouse_id] }] : []));
      dialog?.close();
    }}>Use these quantities</Button></div>
  </div>;
}
