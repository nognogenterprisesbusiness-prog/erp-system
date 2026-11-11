"use client";

import { useActionState, useState } from "react";
import { decideMaterialRequestSchema } from "@nognog/domain";
import { decideMaterialRequestAction, type RequestActionState } from "@/app/(workspace)/requests/actions";
import { Button } from "@/components/ui/button";
import { FormField, fieldControlClass } from "@/components/ui/form-field";
import { RecordCreateDialog } from "@/components/ui/record-create-dialog";
import { WarehouseAllocationEditor, type StockSource, type WarehouseAllocation } from "./warehouse-allocation-editor";
import { tableHeadClass } from "@/components/ui/table-sort-heading";

type RequestLine = {
  id: string;
  name: string;
  code: string;
  requested: number;
  approved: number;
  reserved: number;
  dispatched: number;
  received: number;
  variance: number;
  unit: string;
  sourceOnHand: number | null;
  sourceAvailable: number | null;
  siteOnHand: number | null;
  siteAvailable: number | null;
  allocations: {warehouse_name: string; original_quantity: number; remaining_quantity: number}[];
};

const initialState: RequestActionState = { ok: false, message: "" };
const quantity = new Intl.NumberFormat("en-PH", { maximumFractionDigits: 4 });

export function MaterialRequestItems({ requestId, lines, canDecide, hasSource, sourceName, siteName, submitted, defaultWarehouseId, stockSources }: {
  requestId: string; lines: RequestLine[]; canDecide: boolean; hasSource: boolean;
  sourceName: string; siteName: string; submitted: boolean; defaultWarehouseId: string | null; stockSources: StockSource[];
}) {
  const [state, action, pending] = useActionState(decideMaterialRequestAction, initialState);
  const [idempotencyKey] = useState(() => crypto.randomUUID());
  const [quantities, setQuantities] = useState<Record<string, string>>(() => Object.fromEntries(lines.map((line) => [line.id, String(line.requested)])));
  const [allocations, setAllocations] = useState<Record<string, WarehouseAllocation[]>>({});
  const exceedsStock = lines.some((line) => allocations[line.id]
    ? allocations[line.id].some((item) => {const source=stockSources.find((source) => source.request_line_id===line.id && source.warehouse_id===item.warehouseId);return !source || Number(item.quantity)>source.available;})
    : line.sourceAvailable !== null && Number(quantities[line.id]) > line.sourceAvailable);
  const allocationPayload = Object.fromEntries(lines.map((line) => [line.id, allocations[line.id] ?? (Number(quantities[line.id])>0 && defaultWarehouseId ? [{warehouseId:defaultWarehouseId,quantity:quantities[line.id]}] : [])]));
  const missingSource = lines.some((line) => Number(quantities[line.id])>0 && !defaultWarehouseId && !allocations[line.id]);
  const invalid = !decideMaterialRequestSchema.shape.decisions.safeParse(quantities).success || lines.some((line) => Number(quantities[line.id]) > line.requested);
  const isReduced = lines.some((line) => Number(quantities[line.id]) < line.requested);
  const showWarehouse = submitted && (canDecide || lines.some((line) => line.sourceAvailable !== null));
  const display = (value: number | null, unit: string) => value === null ? "Not visible to your account" : `${quantity.format(value)} ${unit}`;
  const content = <>
    <div className="px-5 pt-5">
      <h2 className="text-base font-semibold text-slate-900">{canDecide ? "Review requested materials" : "Requested materials"}</h2>
      <p className="mt-1 text-sm text-slate-500">{canDecide ? defaultWarehouseId ? `Approve quantities using available stock at ${sourceName}. Enter 0 to reject an item.` : "Select the source warehouse above, or assign warehouses to each material below. Every approved quantity must have a warehouse." : "Requested quantities are what the Engineer or Foreman asked for. View an item for stock and delivery details."}</p>
    </div>
    <div className="mt-4 overflow-x-auto">
      <table className="w-full text-left text-sm">
        <thead className={`hidden sm:table-header-group ${tableHeadClass}`}><tr>
          <th scope="col" className="px-5 py-3">Material</th>
          <th scope="col" className="px-4 py-3 text-right">Requested</th>
          {showWarehouse && <th scope="col" className="px-4 py-3 text-right">Warehouse available</th>}
          {canDecide ? <th scope="col" className="px-4 py-3">Approve quantity</th> : !submitted && <><th scope="col" className="px-4 py-3 text-right">Approved</th><th scope="col" className="px-4 py-3 text-right">Received</th></>}
          <th scope="col" className="px-5 py-3 text-right">Details</th>
        </tr></thead>
        <tbody className="block divide-y divide-slate-100 sm:table-row-group">{lines.map((line) => {
          const custom=allocations[line.id];
          const sources=stockSources.filter((source) => source.request_line_id===line.id);
          const limit = custom ? line.requested : Math.min(line.requested, line.sourceAvailable ?? line.requested);
          const exceedsLimit = Number(quantities[line.id]) > limit;
          const invalidFormat = !decideMaterialRequestSchema.shape.decisions.valueType.safeParse(quantities[line.id]).success;
          return <tr key={line.id} className="grid grid-cols-2 sm:table-row">
            <td className="col-span-2 px-5 py-4"><p className="font-medium text-slate-900">{line.name}</p><p className="mt-1 text-xs text-slate-500">{line.code}</p></td>
            <td className="px-4 py-4 text-right tabular-nums"><span className="mb-1 block text-left text-xs text-slate-500 sm:hidden">Requested</span>{display(line.requested, line.unit)}</td>
            {showWarehouse && <td className="px-4 py-4 text-right tabular-nums"><span className="mb-1 block text-left text-xs text-slate-500 sm:hidden">Warehouse available</span><span className={line.sourceAvailable !== null && line.requested > line.sourceAvailable ? "font-semibold text-amber-800" : "font-semibold text-slate-900"}>{custom ? custom.map((item) => `${stockSources.find((source) => source.warehouse_id===item.warehouseId)?.warehouse_name ?? "Warehouse"}: ${item.quantity} ${line.unit}`).join(" · ") || "No stock allocated" : !hasSource ? "Choose warehouse" : line.sourceAvailable === null && canDecide ? "Checked on approval" : display(line.sourceAvailable, line.unit)}</span>{!custom && line.sourceAvailable !== null && line.requested > line.sourceAvailable && <span className="mt-1 block text-xs text-amber-800">Short by {display(line.requested - line.sourceAvailable, line.unit)}</span>}</td>}
            {canDecide ? <td className="px-4 py-4 sm:w-44">
              <span aria-hidden="true" className="mb-1 block text-xs text-slate-500 sm:hidden">Approve quantity</span><label className="sr-only" htmlFor={`approved-${line.id}`}>Approve quantity for {line.name} ({line.unit})</label>
              <div className="flex items-center gap-2"><input id={`approved-${line.id}`} className={`${fieldControlClass} min-w-20 ${exceedsLimit || invalidFormat ? "border-amber-500" : ""}`} type="number" inputMode="decimal" min={0} max={limit} step="0.0001" value={quantities[line.id] ?? ""} onChange={(event) => setQuantities((current) => ({ ...current, [line.id]: event.target.value }))} aria-invalid={exceedsLimit || invalidFormat || undefined} aria-describedby={exceedsLimit || invalidFormat ? `stock-error-${line.id}` : undefined} disabled={pending} readOnly={!!custom} required /><span className="shrink-0 whitespace-nowrap text-xs text-slate-500">{line.unit}</span></div>
              {(exceedsLimit || invalidFormat) && <p id={`stock-error-${line.id}`} className="mt-1 text-xs text-amber-800">{invalidFormat ? "Enter 0 or a positive quantity, with up to 4 decimal places." : `Approve up to ${display(limit, line.unit)}.`}</p>}
              {sources.length > 0 && <div className="mt-2"><RecordCreateDialog title={`Choose warehouses · ${line.name}`} triggerLabel={custom ? "Edit sources" : !defaultWarehouseId ? "Choose warehouses" : "Find stock elsewhere"} triggerVariant="ghost" triggerSize="sm" triggerIcon={null}>
                <WarehouseAllocationEditor sources={sources} current={custom ?? (defaultWarehouseId ? [{warehouseId:defaultWarehouseId,quantity:quantities[line.id]}] : [])} requested={line.requested} unit={line.unit} onApply={(next) => {
                  setAllocations((previous) => ({...previous,[line.id]:next}));
                  setQuantities((previous) => ({...previous,[line.id]:String(Math.round(next.reduce((sum,item) => sum+Number(item.quantity),0)*10000)/10000)}));
                }} />
              </RecordCreateDialog></div>}
            </td> : !submitted && <><td className="px-4 py-4 text-right tabular-nums"><span className="mb-1 block text-xs text-slate-500 sm:hidden">Approved</span>{display(line.approved, line.unit)}</td><td className="px-4 py-4 text-right tabular-nums"><span className="mb-1 block text-xs text-slate-500 sm:hidden">Received</span>{display(line.received, line.unit)}</td></>}
            <td className="px-5 py-4 text-right"><RecordCreateDialog title={line.name} triggerLabel="View" triggerAriaLabel={`View stock and delivery details for ${line.name}`} triggerVariant="outline" triggerSize="sm" triggerIcon={null}>
              <p className="mb-4 text-sm text-slate-500">{line.code}</p>
              <h3 className="font-semibold text-slate-900">Current stock</h3>
              <p className="mt-1 text-sm text-slate-500">These balances include other requests and recorded use.</p>
              <dl className="mt-3 grid grid-cols-2 gap-4 rounded-xl bg-slate-50 p-4 text-sm">
                <div>{line.allocations.length > 0 ? <><dt className="text-slate-500">Allocated sources</dt>{line.allocations.map((allocation) => <dd key={allocation.warehouse_name} className="mt-2"><strong>{allocation.warehouse_name}</strong><p className="text-xs text-slate-500">{display(allocation.original_quantity,line.unit)} approved · {display(allocation.remaining_quantity,line.unit)} awaiting release</p></dd>)}</> : <><dt className="text-slate-500">Warehouse · {sourceName}</dt><dd className="mt-1 font-semibold">{hasSource ? display(line.sourceOnHand, line.unit) : "No warehouse selected"}</dd><dd className="text-xs text-slate-500">{hasSource ? `${display(line.sourceAvailable, line.unit)} available` : "Choose sources before approval"}</dd></>}</div>
                <div><dt className="text-slate-500">Site · {siteName}</dt><dd className="mt-1 font-semibold">{display(line.siteOnHand, line.unit)}</dd><dd className="text-xs text-slate-500">{display(line.siteAvailable, line.unit)} available</dd></div>
              </dl>
              <h3 className="mt-6 font-semibold text-slate-900">This request only</h3>
              <dl className="mt-3 grid grid-cols-2 gap-4 text-sm">{([
                ["Requested", line.requested], ["Approved", line.approved], ["Reserved", line.reserved],
                ["Released", line.dispatched], ["Received", line.received],
                ["In transit", line.dispatched - line.received - line.variance], ["Approved loss / damage", line.variance],
              ] satisfies [string, number][]).map(([label, value]) => <div key={label}><dt className="text-slate-500">{label}</dt><dd className="mt-1 font-semibold tabular-nums">{display(value, line.unit)}</dd></div>)}</dl>
            </RecordCreateDialog></td>
          </tr>;
        })}</tbody>
      </table>
    </div>
    {canDecide && <div className="border-t border-slate-100 p-5">
      <FormField label={isReduced ? "Reason for reduction or rejection" : "Decision note (optional)"} htmlFor="decisionReason">
        <textarea id="decisionReason" name="reason" className={`${fieldControlClass} h-auto py-3`} rows={2} minLength={isReduced ? 3 : undefined} maxLength={500} required={isReduced} disabled={pending} />
      </FormField>
      {!state.ok && state.message && <p role="alert" className="mt-3 text-sm font-medium text-red-600">{state.message}</p>}
      {exceedsStock && <p role="alert" className="mt-3 text-sm text-amber-800">Reduce the highlighted quantities to available stock, or change the source warehouse.</p>}
      {missingSource && <p className="mt-3 text-sm text-slate-600">Choose the warehouse quantities for each material before approving.</p>}
      <div className="mt-4 flex justify-end"><Button type="submit" disabled={pending || exceedsStock || invalid || missingSource}>{pending ? "Saving…" : lines.every((line) => Number(quantities[line.id]) === 0) ? "Reject request" : "Approve quantities"}</Button></div>
    </div>}
  </>;
  const className = "mt-5 scroll-mt-24 overflow-hidden rounded-xl border border-slate-200 bg-white";
  return canDecide ? <form id="request-decision" aria-busy={pending} action={action} className={className}>
    <input type="hidden" name="idempotencyKey" value={idempotencyKey} />
    <input type="hidden" name="requestId" value={requestId} />
    <input type="hidden" name="decisions" value={JSON.stringify(quantities)} />
    {stockSources.length > 0 && <input type="hidden" name="allocations" value={JSON.stringify(allocationPayload)} />}
    {content}
  </form> : <section className={className}>{content}</section>;
}
