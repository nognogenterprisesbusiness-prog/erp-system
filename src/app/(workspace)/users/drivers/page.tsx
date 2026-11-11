import { Button } from "@/components/ui/button";
import { RecordViewLink } from "@/components/ui/record-view-link";
import { z } from "zod";
import { notFound } from "next/navigation";
import { DriverTruckForm } from "@/components/assets/asset-expense-forms";
import { IntentLink as Link } from "@/components/layout/intent-link";
import { HistoryPagination } from "@/components/ui/history-pagination";
import { PageHeader } from "@/components/ui/page-header";
import { UserInviteDialog } from "@/components/users/user-management";
import { requireManager } from "@/lib/auth";
import { pageNumber } from "@/lib/data/pagination";
import { createClient } from "@/lib/supabase/server";

export default async function DriversPage({ searchParams }: { searchParams: Promise<{ driver?: string; page?: string; truck?: string }> }) {
  await requireManager();
  const { driver, page: rawPage, truck } = await searchParams;
  const client = await createClient();
  if (driver) {
    if (!z.uuid().safeParse(driver).success) notFound();
    const search = (truck ?? "").replace(/[^\p{L}\p{N} -]/gu, "").trim().slice(0, 60);
    const vehicleQuery = client.from("assets").select("id,code,name").eq("asset_kind", "vehicle")
      .is("archived_at", null).neq("status", "retired").order("code").limit(100);
    if (search) vehicleQuery.or(`code.ilike.%${search}%,name.ilike.%${search}%`);
    const [role, profile, assignment, vehicles] = await Promise.all([
      client.from("user_roles").select("user_id").eq("user_id", driver).eq("role", "driver").maybeSingle(),
      client.from("profiles").select("full_name,email").eq("id", driver).maybeSingle(),
      client.from("driver_truck_assignments").select("asset_id").eq("driver_id", driver).maybeSingle(),
      vehicleQuery,
    ]);
    if (role.error || profile.error || assignment.error || vehicles.error) throw new Error("Unable to load driver details.");
    if (!role.data || !profile.data) notFound();
    const current = assignment.data?.asset_id;
    const options = vehicles.data;
    let currentTruck = current ? options.find((vehicle) => vehicle.id === current) : undefined;
    if (current && !currentTruck) {
      const existing = await client.from("assets").select("id,code,name").eq("id", current).maybeSingle();
      if (existing.error) throw new Error("Unable to load the assigned truck.");
      if (existing.data) { options.unshift(existing.data); currentTruck = existing.data; }
    }
    return <>
      <PageHeader title={profile.data.full_name} description={profile.data.email ?? undefined} action={<Button variant="outline" size="sm" asChild><Link  href="/users/drivers">Back to drivers</Link></Button>} />
      <section className="mt-6 max-w-xl space-y-4 rounded-xl border border-slate-200 bg-white p-5">
        <div>
          <p className="text-xs text-slate-600">Current truck</p>
          {currentTruck ? <Link className="mt-1 inline-block font-semibold text-cyan-800 underline" href={`/vehicles/${currentTruck.id}`}>{currentTruck.code} · {currentTruck.name}</Link>
            : <p className="mt-1 font-semibold">No truck assigned</p>}
          <p className="mt-1 text-xs text-slate-600">A driver has one truck at a time. Several drivers can share a truck for shifts.</p>
        </div>
        <form className="flex flex-wrap items-end gap-2">
          <input type="hidden" name="driver" value={driver} />
          <label className="grid gap-1 text-sm">Find a truck<input className="rounded-md border border-slate-300 px-3 py-2" name="truck" defaultValue={search} maxLength={60} /></label>
          <button className="rounded-md border border-slate-300 px-3 py-2 text-sm" type="submit">Search</button>
        </form>
        <DriverTruckForm key={`${driver}:${current ?? ""}:${search}`} driverId={driver} current={current}
          vehicles={options.map((vehicle) => ({ id: vehicle.id, label: `${vehicle.code} · ${vehicle.name}` }))} />
      </section>
    </>;
  }
  const page = pageNumber(rawPage);
  const pageSize = 25;
  const roles = await client.from("user_roles").select("user_id", { count: "exact" }).eq("role", "driver")
    .order("granted_at", { ascending: false }).order("user_id").range((page - 1) * pageSize, page * pageSize - 1);
  if (roles.error) throw new Error("Unable to load driver accounts.");
  const ids = roles.data.map((row) => row.user_id);
  const [profiles, assignments] = ids.length ? await Promise.all([
    client.from("profiles").select("id,full_name,email,is_active,onboarding_required").in("id", ids),
    client.from("driver_truck_assignments").select("driver_id,asset_id").in("driver_id", ids),
  ]) : [null, null];
  if (profiles?.error || assignments?.error) throw new Error("Unable to load driver profiles.");
  const truckIds = [...new Set(assignments?.data?.map((row) => row.asset_id) ?? [])];
  const trucks = truckIds.length ? await client.from("assets").select("id,code,name").in("id", truckIds) : null;
  if (trucks?.error) throw new Error("Unable to load assigned trucks.");
  const byId = new Map(profiles?.data?.map((profile) => [profile.id, profile]));
  const truckById = new Map(trucks?.data?.map((truck) => [truck.id, truck]));
  const truckByDriver = new Map(assignments?.data?.map((row) => [row.driver_id, truckById.get(row.asset_id)]));
  return <>
    <PageHeader title="Drivers" description="Invite drivers and assign their trucks." action={<UserInviteDialog roles={["driver"]} />} />
    <Link className="mt-4 inline-block text-sm underline" href="/users">All users</Link>
    <ul className="mt-4 divide-y rounded-xl border border-slate-200 bg-white">
      {ids.length === 0 && <li className="p-4 text-sm text-slate-600">No drivers on this page.</li>}
      {ids.map((id) => {
        const profile = byId.get(id);
        if (!profile) return null;
        return <li key={id} className="p-4"><Link className="font-medium text-cyan-800 underline" href={`/users/drivers?driver=${id}`}>{profile.full_name}</Link>
          <p className="mt-1 text-sm text-slate-600">{profile.email} · {profile.onboarding_required ? "Invitation pending" : profile.is_active ? "Enabled" : "Disabled"}</p>
          <p className="mt-1 text-sm text-slate-700">{truckByDriver.get(id) ? `Truck: ${truckByDriver.get(id)!.code} · ${truckByDriver.get(id)!.name}` : "No truck assigned"}</p><div className="mt-3 flex justify-end"><RecordViewLink href={`/users/drivers?driver=${id}`} name={profile.full_name} /></div></li>;
      })}
    </ul>
    <HistoryPagination path="/users/drivers" page={page} count={roles.count ?? 0} pageSize={pageSize} />
  </>;
}
