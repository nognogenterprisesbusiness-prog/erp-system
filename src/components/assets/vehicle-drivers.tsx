import { RecordCreateDialog } from "@/components/ui/record-create-dialog";
import { AccountAvatar } from "@/components/ui/account-avatar";
import { Button } from "@/components/ui/button";
import { IntentLink as Link } from "@/components/layout/intent-link";
import { createClient } from "@/lib/supabase/server";
import { safeSearchTerm } from "@/lib/data/search";
import type { ProfileRow } from "@/types/database";
import { AddVehicleDriverForm } from "./asset-expense-forms";

type DriverProfile = Pick<ProfileRow, "id" | "full_name" | "email" | "is_active" | "onboarding_required" | "avatar_path" | "updated_at">;
const avatarUrl = (driver: DriverProfile) => driver.avatar_path ? `/profile/avatar?userId=${driver.id}&v=${encodeURIComponent(driver.updated_at)}` : undefined;

export async function VehicleDrivers({ assetId, assetName, search, canAssign }: { assetId: string; assetName: string; search?: string; canAssign: boolean }) {
  const client = await createClient();
  const { data: assignments, error } = await client.from("driver_truck_assignments").select("driver_id").eq("asset_id", assetId);
  if (error) throw new Error("Unable to load assigned drivers.");
  const ids = assignments.map(row => row.driver_id);
  const term = safeSearchTerm(search);
  // The relationship is defined by user_roles.user_id -> profiles.id in the auth migration.
  let candidatesQuery = client.from("profiles").select("id,full_name,email,is_active,onboarding_required,avatar_path,updated_at,user_roles!user_roles_user_id_fkey!inner(role)")
    .eq("user_roles.role", "driver").eq("is_active", true).eq("onboarding_required", false).order("full_name").order("id").limit(50);
  if (term) candidatesQuery = candidatesQuery.ilike("full_name", `%${term}%`);
  const [profiles, candidates] = await Promise.all([
    ids.length ? client.from("profiles").select("id,full_name,email,is_active,onboarding_required,avatar_path,updated_at").in("id", ids).order("full_name") : Promise.resolve({ data: [], error: null }),
    canAssign ? candidatesQuery.overrideTypes<DriverProfile[], { merge: false }>() : Promise.resolve({ data: [], error: null }),
  ]);
  if (profiles.error || candidates.error) throw new Error("Unable to load driver accounts.");
  const available = (candidates.data ?? []).filter(driver => !ids.includes(driver.id));
  const current = available.length ? await client.from("driver_truck_assignments").select("driver_id,asset_id").in("driver_id", available.map(driver => driver.id)) : null;
  if (current?.error) throw new Error("Unable to load driver assignments.");
  const truckIds = [...new Set(current?.data?.map(row => row.asset_id) ?? [])];
  const trucks = truckIds.length ? await client.from("assets").select("id,name").in("id", truckIds) : null;
  if (trucks?.error) throw new Error("Unable to load assigned trucks.");
  const truckNames = new Map(trucks?.data?.map(truck => [truck.id, truck.name]));
  const currentByDriver = new Map(current?.data?.map(row => [row.driver_id, truckNames.get(row.asset_id) ?? "another truck"]));
  return <section className="mt-4 rounded-xl border border-slate-200 bg-white px-5 py-4">
    <div className="flex flex-wrap items-center justify-between gap-3"><div><h2 className="text-sm font-semibold text-slate-800">Assigned drivers <span className="ml-1 font-normal text-slate-500">{ids.length}</span></h2><p className="mt-1 text-xs text-slate-500">Several drivers can share this truck for shifts.</p></div>
      {canAssign && <RecordCreateDialog title={`Add driver to ${assetName}`} triggerLabel="Add driver" triggerSize="sm" initialOpen={search !== undefined} closeHref={`/vehicles/${assetId}`}>
        <p className="text-sm leading-6 text-slate-600">Assign another driver to this truck. Each driver has one truck at a time.</p>
        <form className="mt-4 flex flex-wrap items-end gap-2" action={`/vehicles/${assetId}`}><label className="grid min-w-0 flex-1 gap-2 text-sm font-medium">Find a driver<input name="driverSearch" defaultValue={term} maxLength={80} placeholder="Search driver name" className="min-h-11 w-full rounded-lg border border-slate-200 px-3 font-normal" /></label><Button type="submit" variant="outline">Search</Button></form>
        {available.length ? <AddVehicleDriverForm assetId={assetId} drivers={available.map(driver => ({ id: driver.id, name: driver.full_name, currentTruck: currentByDriver.get(driver.id) }))} /> : <p className="mt-5 rounded-lg bg-slate-50 p-4 text-sm text-slate-600">{term ? "No other active drivers match this name." : "No other active drivers found. Add a driver account in Users, or search by name."}</p>}
        {(candidates.data?.length ?? 0) === 50 && <p className="mt-3 text-xs text-slate-500">Showing up to 50 matches. Search by name to narrow the list.</p>}
      </RecordCreateDialog>}
    </div>
    {!ids.length ? <p className="mt-4 text-sm text-slate-500">No driver assigned to this vehicle.</p> : <ul className="mt-3 divide-y divide-slate-100">{profiles.data?.map(driver => <li key={driver.id} className="flex flex-wrap items-center justify-between gap-3 py-3"><div className="flex min-w-0 items-center gap-3"><AccountAvatar name={driver.full_name} photo={avatarUrl(driver)} className="bg-cyan-50 text-cyan-800" /><div className="min-w-0"><p className="break-words text-sm font-medium text-slate-900">{driver.full_name}</p><p className="mt-1 text-xs text-slate-500">{driver.onboarding_required ? "Invitation pending" : driver.is_active ? "Assigned to this truck" : "Account disabled"}</p></div></div>
      <RecordCreateDialog title={driver.full_name} triggerLabel="View" triggerIcon={null} triggerVariant="outline" triggerSize="sm" triggerAriaLabel={`View driver ${driver.full_name}`}>
        <div className="mb-4 flex items-center gap-3"><AccountAvatar name={driver.full_name} photo={avatarUrl(driver)} /><p className="font-semibold">{driver.full_name}</p></div>
        <dl className="divide-y divide-slate-100 text-sm">{[["Email", driver.email ?? "Not recorded"], ["Account", driver.onboarding_required ? "Invitation pending" : driver.is_active ? "Active" : "Disabled"], ["Assigned truck", assetName]].map(([label, value]) => <div key={label} className="grid gap-1 py-3 sm:grid-cols-[120px_minmax(0,1fr)]"><dt className="text-slate-500">{label}</dt><dd className="break-words font-medium text-slate-800">{value}</dd></div>)}</dl>
        <div className="mt-5 flex justify-end"><Button variant="outline" asChild><Link href={`/users/drivers?driver=${driver.id}`}>Change assignment</Link></Button></div>
      </RecordCreateDialog>
    </li>)}</ul>}
  </section>;
}
