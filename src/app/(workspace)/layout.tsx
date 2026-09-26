import { WorkspaceShell } from "@/components/layout/workspace-shell";
import { requireUser } from "@/lib/auth";
import { roleLabels } from "@/lib/users/access";

export const dynamic = "force-dynamic";

export default async function WorkspaceLayout({ children }: { children: React.ReactNode }) {
  const user = await requireUser();
  return <WorkspaceShell userId={user.userId} name={user.profile.full_name} avatar={user.profile.avatar_path ? `/profile/avatar?v=${encodeURIComponent(user.profile.updated_at)}` : undefined} roleLabel={roleLabels[user.roles[0]] ?? "Team member"} canViewProcurement={user.canViewProcurement} canViewFinance={user.canViewLaborRates} canViewDailyReports={user.canViewDailyReports} canViewRequests={user.canManage || user.roles.some((role) => ["engineer", "foreman"].includes(role))} canDispatchRequests={user.canOperateInventory} canManage={user.canManage}>{children}</WorkspaceShell>;
}
