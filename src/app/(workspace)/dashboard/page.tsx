import type { Metadata } from "next";
import { DashboardOverview } from "@/components/dashboard/dashboard-overview";
import { requireUser } from "@/lib/auth";
import { getDashboardData } from "@/lib/data/dashboard";

export const metadata: Metadata = { title: "Operations Dashboard | Nognog Enterprises", description: "Live construction operations overview." };
export default async function DashboardPage() {
  const user = await requireUser();
  const canViewConsumption = user.canOperateInventory || user.roles.some((role) => ["engineer", "foreman"].includes(role));
  const data = await getDashboardData({ finance: user.canViewLaborRates, audit: user.canManage, consumption: canViewConsumption });
  return <DashboardOverview name={user.profile.full_name} canManage={user.canManage} canViewRequests={user.canManage || user.roles.some((role) => ["engineer", "foreman"].includes(role))} canViewConsumption={canViewConsumption} {...data} />;
}
