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
  const { data, count, error } = await client.from("asset_expenses").select("*", { count: "exact" }).eq("asset_id", assetId)
    .order("expense_date", { ascending: false }).order("id", { ascending: false }).range((page - 1) * pageSize, page * pageSize - 1);
  if (error) throw new Error("Unable to load asset expenses.");
  // Profile RLS decides which submitter names this viewer may see.
  const submitterIds = [...new Set(data.map((entry) => entry.submitted_by))];
  const submitters = submitterIds.length ? await client.from("profiles").select("id,full_name").in("id", submitterIds) : null;
  const submitterName = new Map(submitters?.data?.map((profile) => [profile.id, profile.full_name]));
  const path = `/${kind === "vehicle" ? "vehicles" : "equipment"}/${assetId}`;
  return <section className="mt-6 rounded-xl border border-slate-200 bg-white p-5">
    <h2 className="text-lg font-semibold">Asset expenses</h2>
    {kind === "vehicle" && <p className="mt-1 text-sm text-slate-600">Project diesel receipts appear separately below.</p>}
    {canManage && canAdd && <details className="mt-4"><summary className="cursor-pointer font-medium text-cyan-800">Add expense</summary>
      <AddAssetExpenseForm assetId={assetId} initialKey={randomUUID()} today={philippinesDate()} />
    </details>}
    {data.length === 0 ? <p className="mt-4 text-sm text-slate-600">No asset expenses on this page.</p> :
      <ul className="mt-4 divide-y divide-slate-100">
        {data.map((entry) => <li key={entry.id} className="grid gap-1 py-3 text-sm">
          <div className="flex flex-wrap justify-between gap-2"><strong>{assetExpenseLabels[entry.category]} · {entry.expense_date}</strong><span className={entry.reversed_at ? "text-slate-500 line-through" : undefined}>{money.format(entry.amount)}</span></div>
          <p className="text-slate-600">Recorded by {submitterName.get(entry.submitted_by) ?? "a team member"}</p>
          {entry.notes && <p className="break-words text-slate-600">{entry.notes}</p>}
          {entry.receipt_path && <a className="w-fit text-cyan-800 underline" href={`/asset-expense-receipts/${entry.id}`} target="_blank" rel="noreferrer">View receipt</a>}
          {entry.reversed_at ? <p className="text-slate-600">Reversed · {entry.reversal_reason}</p> :
            canManage && <details><summary className="w-fit cursor-pointer text-cyan-800">Correct expense</summary><ReverseAssetExpenseForm assetId={assetId} expenseId={entry.id} /></details>}
        </li>)}
      </ul>}
    <HistoryPagination path={path} page={page} count={count ?? 0} pageSize={pageSize} parameter="assetExpensePage" filters={filters} />
  </section>;
}

export async function VehicleDrivers({ assetId }: { assetId: string }) {
  const client = await createClient();
  const { data, error } = await client.from("driver_truck_assignments").select("driver_id").eq("asset_id", assetId);
  if (error) throw new Error("Unable to load assigned drivers.");
  const ids = data.map((row) => row.driver_id);
  const profiles = ids.length ? await client.from("profiles").select("id,full_name,is_active,onboarding_required").in("id", ids).order("full_name") : null;
  if (profiles?.error) throw new Error("Unable to load driver profiles.");
  return <section className="mt-6 rounded-xl border border-slate-200 bg-white p-5">
    <h2 className="text-lg font-semibold">Assigned drivers</h2>
    <ul className="mt-2 space-y-1 text-sm">
      {!ids.length && <li>No drivers assigned.</li>}
      {profiles?.data?.map((driver) => <li key={driver.id}><Link className="text-cyan-800 underline" href={`/users/drivers?driver=${driver.id}`}>{driver.full_name}</Link>
        {driver.onboarding_required ? " · Invitation pending" : !driver.is_active ? " · Disabled" : ""}</li>)}
    </ul>
    <Link className="mt-3 inline-block text-sm text-cyan-800 underline" href="/users/drivers">Manage drivers</Link>
  </section>;
}
