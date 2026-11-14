import { redirect } from "next/navigation";
import type { Metadata } from "next";
import { DashboardOverview } from "@/components/dashboard/dashboard-overview";
import { requireUser } from "@/lib/auth";
import { getDashboardData } from "@/lib/data/dashboard";
import { workspaceHomeHref } from "@/lib/users/access";
import { HrOverview } from "@/components/dashboard/hr-overview";

export const metadata: Metadata = { title: "Operations Dashboard | Nognog", description: "Live construction operations overview." };
export default async function DashboardPage() {
  const user = await requireUser();
  if (user.workforceOnly) return <HrOverview />;
  const homeHref = workspaceHomeHref(user.roles);
  if (homeHref !== "/dashboard") redirect(homeHref);
  const canViewConsumption = user.canOperateInventory || user.roles.some((role) => ["engineer", "foreman"].includes(role));
  const canViewRequests = user.canManage || user.roles.some((role) => ["engineer", "foreman"].includes(role));
  const data = await getDashboardData({ finance: user.canViewLaborRates, audit: user.canManage, consumption: canViewConsumption, requests: canViewRequests });
  return <DashboardOverview name={user.profile.full_name} canManage={user.canManage} canViewRequests={canViewRequests} canViewConsumption={canViewConsumption} {...data} />;
}
