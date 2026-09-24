import Link from "next/link";

import { InitialRoleForm, UserInviteForm, UserPasswordResetForm, UserStatusForm } from "@/components/users/user-management";
import { UserProfileButton } from "@/components/users/user-profile-button";
import { DataTableShell } from "@/components/ui/data-table-shell";
import { EmptyState } from "@/components/ui/empty-state";
import { PageHeader } from "@/components/ui/page-header";
import { requireManager } from "@/lib/auth";
import { canAssignInitialRole, canManageAccount, invitableRoles, roleLabels } from "@/lib/users/access";
import { createClient } from "@/lib/supabase/server";

export default async function UsersPage({ searchParams }: { searchParams: Promise<{ page?: string }> }) {
  const actor = await requireManager();
  const params = await searchParams;
  const page = Math.max(1, Math.min(1000, Number.parseInt(params.page ?? "1", 10) || 1));
  const supabase = await createClient();
  const { data: profiles, count, error } = await supabase.from("profiles")
    .select("id,full_name,email,phone,avatar_path,is_active,onboarding_required,created_at,updated_at", { count: "exact" })
    .order("created_at", { ascending: false }).range((page - 1) * 25, page * 25 - 1);
  if (error) throw new Error("Unable to load user accounts.");
  const ids = (profiles ?? []).map((profile) => profile.id);
  const { data: roleRows, error: roleError } = ids.length
    ? await supabase.from("user_roles").select("user_id,role").in("user_id", ids)
    : { data: [], error: null };
  if (roleError) throw new Error("Unable to load user roles.");
  const rolesByUser = new Map<string, Array<(typeof roleRows)[number]["role"]>>();
  for (const row of roleRows ?? []) rolesByUser.set(row.user_id, [...(rolesByUser.get(row.user_id) ?? []), row.role]);
  const assignableRoles = invitableRoles.filter((role) => canAssignInitialRole(actor.roles, role));
  const pageCount = Math.max(1, Math.ceil((count ?? 0) / 25));

  return <>
    <PageHeader eyebrow="Access management" title="Users" description="Invite teammates, assign their initial role, and disable access when someone leaves." />
    <div className="mt-7"><UserInviteForm roles={assignableRoles} /></div>
    <div className="mt-8 flex items-end justify-between gap-3"><div><h2 className="text-lg font-semibold">Team accounts</h2><p className="text-xs text-slate-500">{count ?? 0} accounts. Employee records without login access are managed separately.</p></div></div>
    <div className="mt-4"><DataTableShell empty={profiles?.length ? undefined : <EmptyState kind="items" title="No user accounts yet" description="Invite a teammate to create the first account." />}>
      <table className="w-full min-w-[820px] text-left text-sm"><thead className="bg-slate-50 text-slate-500"><tr><th scope="col" className="px-5 py-3">Person</th><th scope="col" className="px-5 py-3">Role</th><th scope="col" className="px-5 py-3">Access</th><th scope="col" className="px-5 py-3 text-right">Action</th></tr></thead><tbody className="divide-y divide-slate-100">{(profiles ?? []).map((profile) => { const roles = rolesByUser.get(profile.id) ?? []; const manageable = canManageAccount(actor.userId, actor.roles, profile.id, roles); const status = profile.onboarding_required ? "Invitation pending" : !profile.is_active ? "Disabled" : roles.length ? "Enabled" : "No role"; return <tr key={profile.id}><td className="px-5 py-4"><UserProfileButton id={profile.id} name={profile.full_name} email={profile.email} phone={profile.phone} roles={roles.map((role) => roleLabels[role]).join(", ")} status={status} hasPhoto={Boolean(profile.avatar_path)} /></td><td className="px-5 py-4 text-slate-600">{roles.length ? roles.map((role) => roleLabels[role]).join(", ") : <span className="text-amber-700">No role assigned</span>}</td><td className="px-5 py-4"><span className={`rounded-full px-2.5 py-1 text-xs font-semibold ${profile.is_active && roles.length ? "bg-emerald-50 text-emerald-700" : "bg-slate-100 text-slate-600"}`}>{status}</span></td><td className="px-5 py-4 text-right">{manageable && !roles.length ? <InitialRoleForm userId={profile.id} roles={assignableRoles} /> : manageable ? <div className="flex flex-wrap justify-end gap-2"><UserStatusForm userId={profile.id} isActive={profile.is_active} />{profile.is_active && !profile.onboarding_required ? <UserPasswordResetForm userId={profile.id} /> : null}</div> : <span className="text-xs text-slate-400">—</span>}</td></tr>; })}</tbody></table>
    </DataTableShell></div>
    {pageCount > 1 ? <nav aria-label="User pages" className="mt-4 flex items-center justify-end gap-3 text-xs text-slate-600">{page > 1 ? <Link className="hover:text-cyan-700" href={`/users?page=${page - 1}`}>Previous</Link> : null}<span>Page {page} of {pageCount}</span>{page < pageCount ? <Link className="hover:text-cyan-700" href={`/users?page=${page + 1}`}>Next</Link> : null}</nav> : null}
  </>;
}
