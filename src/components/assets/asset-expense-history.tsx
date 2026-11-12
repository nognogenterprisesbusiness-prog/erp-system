import { readCountedPage } from "@/lib/data/read-counted-page";
import { displayDate } from "@/lib/ui/display";
import { RecordCreateDialog } from "@/components/ui/record-create-dialog";
import { Button } from "@/components/ui/button";
import { ActionDialog } from "@/components/ui/action-dialog";
import { randomUUID } from "node:crypto";
import { assetExpenseLabels, philippinesDate } from "@nognog/domain";
import { IntentLink as Link } from "@/components/layout/intent-link";
import { HistoryPagination } from "@/components/ui/history-pagination";
import { createClient } from "@/lib/supabase/server";
import { AddAssetExpenseForm, ReverseAssetExpenseForm } from "./asset-expense-forms";

const money = new Intl.NumberFormat("en-PH", { style: "currency", currency: "PHP" });

export async function AssetExpenseHistory({ assetId, kind, page, canManage, canAdd, filters }: {
  assetId: string; kind: "equipment" | "vehicle"; page: number; canManage: boolean; canAdd: boolean; filters: Record<string, string>;
}) {
  const client = await createClient();
  const pageSize = 20;
  const { data, count, page: currentPage } = await readCountedPage((from, to) => client.from("asset_expenses").select("*", { count: "exact" }).eq("asset_id", assetId)
    .order("expense_date", { ascending: false }).order("id", { ascending: false }).range(from, to), page, "asset expenses", pageSize);
  // Profile RLS decides which submitter names this viewer may see.
  const submitterIds = [...new Set(data.map((entry) => entry.submitted_by))];
  const submitters = submitterIds.length ? await client.from("profiles").select("id,full_name").in("id", submitterIds) : null;
  const submitterName = new Map(submitters?.data?.map((profile) => [profile.id, profile.full_name]));
  const path = `/${kind === "vehicle" ? "vehicles" : "equipment"}/${assetId}`;
  if (submitters?.error) throw new Error("Unable to load expense submitters.");
  return <section className="overflow-hidden rounded-xl border border-slate-200 bg-white">
    <div className="flex flex-wrap items-start justify-between gap-4 border-b border-slate-100 p-5"><div><div className="flex items-center gap-2"><h2 className="text-lg font-semibold">Operating expenses</h2><span className="rounded-full bg-slate-100 px-2 py-0.5 text-xs font-medium text-slate-600">{(count ?? 0).toLocaleString()}</span></div><p className="mt-1 max-w-2xl text-sm leading-6 text-slate-500">Fuel, oil changes, repairs and maintenance for this unit.</p></div>
      {canManage && canAdd && <ActionDialog title="Add expense" triggerLabel="Add expense" triggerVariant="default" retainDraft description="Record an expense for this unit. It stays in unit history and does not automatically charge a project."><AddAssetExpenseForm assetId={assetId} initialKey={randomUUID()} today={philippinesDate()} /></ActionDialog>}
    </div>
    {!data.length ? <p className="p-5 text-sm text-slate-500">{count ? "No expenses on this page." : "No operating expenses recorded yet."}</p> : <ul className="divide-y divide-slate-100">{data.map(entry => <li key={entry.id} className="flex flex-col gap-3 p-5 sm:flex-row sm:justify-between sm:gap-5">
      <div className="min-w-0 flex-1"><div className="flex flex-wrap items-center gap-x-3 gap-y-1"><h3 className="text-sm font-semibold text-slate-900">{assetExpenseLabels[entry.category]}</h3><time className="text-xs text-slate-500">{displayDate(entry.expense_date)}</time>{entry.reversed_at && <span className="rounded-full bg-slate-100 px-2 py-0.5 text-xs font-medium text-slate-600">Reversed</span>}</div>
        {entry.notes && <p className="mt-2 break-words text-sm leading-6 text-slate-600">{entry.notes}</p>}<p className="mt-2 text-xs text-slate-500">Recorded by {submitterName.get(entry.submitted_by) ?? "a team member"}</p>{entry.reversed_at && entry.reversal_reason && <p className="mt-2 text-sm text-slate-500">Correction reason: {entry.reversal_reason}</p>}
      </div>
      <div className="flex shrink-0 flex-wrap items-center justify-between gap-3 sm:flex-col sm:items-end"><p className={`text-base font-semibold tabular-nums ${entry.reversed_at ? "text-slate-400 line-through" : "text-slate-900"}`}>{money.format(entry.amount)}</p><div className="flex flex-wrap items-center gap-2">
        {entry.receipt_path && <Button variant="outline" size="sm" asChild><a href={`/asset-expense-receipts/${entry.id}`} target="_blank" rel="noreferrer">View receipt</a></Button>}
        {!entry.reversed_at && canManage && <RecordCreateDialog title="Correct this expense" triggerLabel="Correct entry" triggerIcon={null} triggerVariant="outline" triggerSize="sm" triggerAriaLabel={`Correct ${assetExpenseLabels[entry.category]} expense of ${money.format(entry.amount)}`}>
          <div className="rounded-xl border border-slate-200 bg-slate-50 p-4"><div className="flex flex-wrap justify-between gap-2 text-sm font-semibold"><p>{assetExpenseLabels[entry.category]}</p><p className="tabular-nums">{money.format(entry.amount)}</p></div><p className="mt-1 text-sm text-slate-500">{displayDate(entry.expense_date)}</p>{entry.notes && <p className="mt-2 text-sm text-slate-600">{entry.notes}</p>}</div>
          <p className="mt-4 text-sm leading-6 text-slate-600">Reverse this entry to remove it from active expense totals. The original stays in history. You can then add a replacement with the correct details.</p><ReverseAssetExpenseForm assetId={assetId} expenseId={entry.id} />
        </RecordCreateDialog>}
      </div></div>
    </li>)}</ul>}
    {((count ?? 0) > pageSize || currentPage > 1) && <div className="border-t border-slate-100 px-5 pb-4"><HistoryPagination replace path={path} page={currentPage} count={count ?? 0} pageSize={pageSize} parameter="assetExpensePage" filters={{ ...filters, section: "expenses" }} /></div>}
  </section>;
}

export async function VehicleDrivers({ assetId, assetName }: { assetId: string; assetName: string }) {
  const client = await createClient();
  const { data, error } = await client.from("driver_truck_assignments").select("driver_id").eq("asset_id", assetId);
  if (error) throw new Error("Unable to load assigned drivers.");
  const ids = data.map(row => row.driver_id);
  const profiles = ids.length ? await client.from("profiles").select("id,full_name,email,is_active,onboarding_required").in("id", ids).order("full_name") : null;
  if (profiles?.error) throw new Error("Unable to load driver profiles.");
  return <section className="mt-4 rounded-xl border border-slate-200 bg-white px-5 py-4">
    <div className="flex flex-wrap items-center justify-between gap-3"><h2 className="text-sm font-semibold text-slate-800">Assigned drivers</h2><Button variant="outline" size="sm" asChild><Link href="/users/drivers">Manage assignments</Link></Button></div>
    {!ids.length ? <p className="mt-3 text-sm text-slate-500">No driver assigned to this vehicle.</p> : <ul className="mt-3 divide-y divide-slate-100">{profiles?.data?.map(driver => <li key={driver.id} className="flex flex-wrap items-center justify-between gap-3 py-2"><div><p className="text-sm font-medium text-slate-900">{driver.full_name}</p>{(driver.onboarding_required || !driver.is_active) && <p className="mt-1 text-xs text-slate-500">{driver.onboarding_required ? "Invitation pending" : "Account disabled"}</p>}</div>
      <RecordCreateDialog title={driver.full_name} triggerLabel="View driver" triggerIcon={null} triggerVariant="outline" triggerSize="sm" triggerAriaLabel={`View driver ${driver.full_name}`}>
        <dl className="divide-y divide-slate-100 text-sm">{[["Email", driver.email ?? "Not recorded"], ["Account", driver.onboarding_required ? "Invitation pending" : driver.is_active ? "Active" : "Disabled"], ["Assigned truck", assetName]].map(([label, value]) => <div key={label} className="grid gap-1 py-3 sm:grid-cols-[120px_minmax(0,1fr)]"><dt className="text-slate-500">{label}</dt><dd className="break-words font-medium text-slate-800">{value}</dd></div>)}</dl>
        <div className="mt-5 flex justify-end"><Button variant="outline" asChild><Link href={`/users/drivers?driver=${driver.id}`}>Manage assignment</Link></Button></div>
      </RecordCreateDialog>
    </li>)}</ul>}
  </section>;
}
