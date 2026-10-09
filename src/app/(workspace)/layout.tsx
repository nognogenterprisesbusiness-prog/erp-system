import { WorkspaceShell } from "@/components/layout/workspace-shell";
import { requireUser } from "@/lib/auth";
import { roleLabels } from "@/lib/users/access";
import { cookies } from "next/headers";
import { RecordListViewProvider } from "@/components/ui/record-list-view";
import { parseRecordViewPreferences, recordViewCookie } from "@/lib/ui/record-view-preferences";

export const dynamic = "force-dynamic";

export default async function WorkspaceLayout({ children, modal }: { children: React.ReactNode; modal?: React.ReactNode }) {
  const user = await requireUser();
  const initialPreferences = parseRecordViewPreferences((await cookies()).get(recordViewCookie)?.value);
  return <RecordListViewProvider initialPreferences={initialPreferences}><WorkspaceShell userId={user.userId} name={user.profile.full_name} avatar={user.profile.avatar_path ? `/profile/avatar?v=${encodeURIComponent(user.profile.updated_at)}` : undefined} roleLabel={roleLabels[user.roles[0]] ?? "Team member"} canViewProcurement={user.canViewProcurement} canViewFinance={user.canViewLaborRates} canViewDailyReports={user.canViewDailyReports} canViewRequests={user.canManage || user.roles.some((role) => ["engineer", "foreman"].includes(role))} canDispatchRequests={user.canOperateInventory} canManage={user.canManage} canSubmitSitePurchases={user.canManage || user.roles.includes("engineer")}>{children}</WorkspaceShell>{modal}</RecordListViewProvider>;
}
