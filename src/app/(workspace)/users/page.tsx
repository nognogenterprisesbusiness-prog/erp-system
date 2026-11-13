import { readCountedPage } from "@/lib/data/read-counted-page";
import { pageNumber } from "@/lib/data/pagination";
import { safeAccountSearchTerm } from "@/lib/data/search";
import { ListFilterBar } from "@/components/ui/list-filter-bar";
import { SearchField } from "@/components/ui/search-field";
import { AccountAvatar } from "@/components/ui/account-avatar";
import { IntentLink as Link } from "@/components/layout/intent-link";

import { UserProfileName, UserRowActions, UserInviteDialog } from "@/components/users/user-management";
import { DataTableShell } from "@/components/ui/data-table-shell";
import { EmptyState } from "@/components/ui/empty-state";
import { Button } from "@/components/ui/button";
import { PageHeader } from "@/components/ui/page-header";
import { requireManager } from "@/lib/auth";
import { canAssignInitialRole, canManageAccount, invitableRoles, roleLabels } from "@/lib/users/access";
import { createClient } from "@/lib/supabase/server";

export default async function UsersPage({ searchParams }: { searchParams: Promise<{ page?: string | string[]; q?: string | string[] }> }) {
  const actor = await requireManager();
  const params = await searchParams;
  const requestedPage = pageNumber(params.page);
  const supabase = await createClient();
  const rawSearch = typeof params.q === "string" ? params.q.slice(0, 80) : "";
  const search = safeAccountSearchTerm(rawSearch);
  let query = supabase.from("profiles")
    .select("id,full_name,email,phone,avatar_path,is_active,onboarding_required,created_at,updated_at", { count: "exact" })
    .order("created_at", { ascending: false }).order("id");
  if (search) query = query.or(`full_name.ilike.%${search}%,email.ilike.%${search}%`);
  const { data: profiles, count, page } = await readCountedPage((from, to) => query.range(from, to), requestedPage, "user accounts", 25);
  const ids = (profiles ?? []).map((profile) => profile.id);
  const { data: roleRows, error: roleError } = ids.length
    ? await supabase.from("user_roles").select("user_id,role").in("user_id", ids)
    : { data: [], error: null };
  if (roleError) throw new Error("Unable to load user roles.");
  const rolesByUser = new Map<string, Array<(typeof roleRows)[number]["role"]>>();
  for (const row of roleRows ?? []) rolesByUser.set(row.user_id, [...(rolesByUser.get(row.user_id) ?? []), row.role]);
  const driverIds = ids.filter(id => rolesByUser.get(id)?.includes("driver"));
  const assignments = driverIds.length ? await supabase.from("driver_truck_assignments").select("driver_id,asset_id").in("driver_id", driverIds) : null;
  if (assignments?.error) throw new Error("Unable to load driver assignments.");
  const truckIds = [...new Set(assignments?.data?.map(row => row.asset_id) ?? [])];
  const trucks = truckIds.length ? await supabase.from("assets").select("id,code,name").in("id", truckIds) : null;
  if (trucks?.error) throw new Error("Unable to load assigned trucks.");
  const truckById = new Map(trucks?.data?.map(truck => [truck.id, { id: truck.id, label: truck.name, secondary: truck.code }]));
  const truckByDriver = new Map(assignments?.data?.map(row => [row.driver_id, truckById.get(row.asset_id)]));
  const assignableRoles = invitableRoles.filter((role) => canAssignInitialRole(actor.roles, role));
  const pageCount = Math.max(1, Math.ceil((count ?? 0) / 25));

  return <>
    <PageHeader title="Users" description="Manage team accounts and access." action={<UserInviteDialog roles={assignableRoles} />} />
    <ListFilterBar><SearchField name="q" label="Search users" placeholder="Search name or email" defaultValue={rawSearch} /></ListFilterBar>
    <div className="mt-5"><DataTableShell empty={profiles?.length ? undefined : <EmptyState kind={search ? "results" : "items"} title={search ? "No matching users" : "No user accounts yet"} description={search ? "Try another name or email." : "Use Add user to send an invitation."} />} footer={<p className="text-xs text-slate-500">{count ?? 0} users</p>}>
      <table className="w-full min-w-[820px] text-left text-sm"><thead className="bg-slate-50 text-slate-500"><tr><th scope="col" className="px-5 py-3">Person</th><th scope="col" className="px-5 py-3">Role</th><th scope="col" className="px-5 py-3">Access</th><th data-record-actions scope="col" className="px-5 py-3 text-right bg-slate-50">Actions</th></tr></thead><tbody className="divide-y divide-slate-100">{(profiles ?? []).map((profile) => { const roles = rolesByUser.get(profile.id) ?? []; const manageable = canManageAccount(actor.userId, actor.roles, profile.id, roles); const status = profile.onboarding_required ? "Invitation pending" : !profile.is_active ? "Disabled" : roles.length ? "Enabled" : "No role"; const avatarUrl = profile.avatar_path ? `/profile/avatar?userId=${encodeURIComponent(profile.id)}&v=${encodeURIComponent(profile.updated_at)}` : undefined; return <tr key={profile.id}><td className="px-5 py-4"><div className="flex items-center gap-3"><AccountAvatar name={profile.full_name} photo={avatarUrl} className="bg-cyan-50 font-semibold text-cyan-700" /><div><UserProfileName profile={{ name: profile.full_name, email: profile.email, phone: profile.phone, roles: roles.map(role => roleLabels[role]).join(", "), status, avatarUrl, truck: roles.includes("driver") ? truckByDriver.get(profile.id)?.label ?? "No truck assigned" : undefined }} /><span className="block text-xs text-slate-500">{profile.email}</span></div></div></td><td className="px-5 py-4 text-slate-600">{roles.length ? roles.map((role) => roleLabels[role]).join(", ") : <span className="text-amber-700">No role assigned</span>}</td><td className="px-5 py-4"><span className={`rounded-full px-2.5 py-1 text-xs font-semibold ${profile.is_active && roles.length ? "bg-emerald-50 text-emerald-700" : "bg-slate-100 text-slate-600"}`}>{status}</span></td><td data-record-actions className="px-5 py-4 text-right bg-white"><UserRowActions userId={profile.id} profile={{ name: profile.full_name, email: profile.email, phone: profile.phone, roles: roles.map(role => roleLabels[role]).join(", "), status, avatarUrl }} isActive={profile.is_active} canReset={profile.is_active && !profile.onboarding_required} roles={!roles.length ? assignableRoles : undefined} manageable={manageable} driverAssignment={roles.includes("driver") ? { current: truckByDriver.get(profile.id) } : undefined} /></td></tr>; })}</tbody></table>
    </DataTableShell></div>
    {pageCount > 1 ? <nav aria-label="User pages" className="mt-4 flex items-center justify-end gap-3 text-xs text-slate-600">{page > 1 ? <Button variant="outline" size="sm" asChild><Link href={`/users?${new URLSearchParams({ q: rawSearch, page: String(page - 1) })}`}>Previous</Link></Button> : null}<span>Page {page} of {pageCount}</span>{page < pageCount ? <Button variant="outline" size="sm" asChild><Link href={`/users?${new URLSearchParams({ q: rawSearch, page: String(page + 1) })}`}>Next</Link></Button> : null}</nav> : null}
  </>;
}
