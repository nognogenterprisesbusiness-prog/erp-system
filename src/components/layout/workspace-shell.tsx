"use client";

import { AssignmentsIcon, Audit01Icon, Building03Icon, Car01Icon, DashboardSquare01Icon, DeliveryTruck01Icon, ExcavatorIcon, File02Icon, FilePenLineIcon, Logout01Icon, QrCodeIcon, Store02Icon, UserGroupIcon, WarehouseIcon, Settings01Icon, HelpCircleIcon } from "@hugeicons/core-free-icons";
import { HugeiconsIcon } from "@hugeicons/react";

import { logoutAction } from "@/app/auth/actions";
import { AppShell } from "@/components/layout/app-shell";
import { HeaderSearch } from "@/components/layout/header-search";
import { NotificationBell } from "@/components/notifications/notification-bell";
import { Button } from "@/components/ui/button";
import Link from "next/link";
import { usePathname } from "next/navigation";

const navItems = [
  { href: "/dashboard", label: "Overview", icon: DashboardSquare01Icon, group: "Projects & operations" },
  { href: "/projects", label: "Projects", icon: Building03Icon, group: "Projects & operations" },
  { href: "/reports/daily", label: "Daily reports", icon: FilePenLineIcon, reports: true, group: "Projects & operations" },
  { href: "/inventory", label: "Inventory", icon: DeliveryTruck01Icon, group: "Materials & assets" },
  { href: "/warehouses", label: "Warehouses", icon: WarehouseIcon, group: "Materials & assets" },
  { href: "/requests", label: "Material requests", icon: AssignmentsIcon, requests: true, group: "Materials & assets" },
  { href: "/equipment", label: "Equipment", icon: ExcavatorIcon, group: "Materials & assets" },
  { href: "/vehicles", label: "Vehicles", icon: Car01Icon, group: "Materials & assets" },
  { href: "/qr-codes", label: "QR tools", icon: QrCodeIcon, group: "Materials & assets" },
  { href: "/suppliers", label: "Suppliers & purchases", icon: Store02Icon, procurement: true, group: "Purchasing & finance" },
  { href: "/billing", label: "Billing & payments", icon: File02Icon, finance: true, group: "Purchasing & finance" },
  { href: "/employees", label: "Employees", icon: UserGroupIcon, group: "People & administration" },
  { href: "/users", label: "Users", icon: UserGroupIcon, manager: true, group: "People & administration" },
  { href: "/audit-logs", label: "Audit logs", icon: Audit01Icon, manager: true, group: "People & administration" },
] as const;

export function WorkspaceShell({ children, userId, name, avatar, roleLabel, canViewProcurement, canViewFinance, canViewDailyReports, canViewRequests, canDispatchRequests, canManage }: { children: React.ReactNode; userId: string; name: string; avatar?: string; roleLabel: string; canViewProcurement: boolean; canViewFinance: boolean; canViewDailyReports: boolean; canViewRequests: boolean; canDispatchRequests: boolean; canManage: boolean }) {
  const pathname = usePathname();
  const items = navItems.filter((item) => (!("procurement" in item) || canViewProcurement) && (!("finance" in item) || canViewFinance) && (!("reports" in item) || canViewDailyReports) && (!("requests" in item) || canViewRequests || canDispatchRequests) && (!("manager" in item) || canManage)).map((item) => item.href === "/qr-codes" && !canManage ? { ...item, href: "/scan" } : item);
  const activeHref = pathname.startsWith("/materials") ? "/inventory" : pathname.startsWith("/purchase-orders") ? "/suppliers" : pathname.startsWith("/attendance") ? "/employees" : pathname.startsWith("/scan") && canManage ? "/qr-codes" : undefined;
  return <AppShell name={name} avatar={avatar} roleLabel={roleLabel} items={items} activeHref={activeHref} footerItems={[{ href: "/profile", label: "Settings", icon: Settings01Icon }, { href: "/help", label: "Help", icon: HelpCircleIcon }]} homeHref="/dashboard" headerSearch={<HeaderSearch />} headerActions={<>
    <NotificationBell userId={userId} />
  </>} profileActions={<><Link href="/profile" className="block rounded-lg px-3 py-2 text-sm text-slate-700 hover:bg-slate-50">My profile</Link><form action={logoutAction}><Button variant="ghost" className="w-full justify-start gap-2 px-3 text-sm" type="submit"><HugeiconsIcon icon={Logout01Icon} size={16} />Sign out</Button></form></>}>{children}</AppShell>;
}
