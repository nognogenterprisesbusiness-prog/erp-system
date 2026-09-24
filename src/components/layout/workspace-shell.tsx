"use client";

import { createContext, useContext, useState } from "react";
import { Audit01Icon, Building03Icon, Car01Icon, ClipboardListIcon, DashboardSquare01Icon, DeliveryTruck01Icon, ExcavatorIcon, File02Icon, Logout01Icon, PackageIcon, QrCodeIcon, Store02Icon, UserGroupIcon, WarehouseIcon } from "@hugeicons/core-free-icons";
import { HugeiconsIcon } from "@hugeicons/react";

import { logoutAction } from "@/app/auth/actions";
import { AppShell } from "@/components/layout/app-shell";
import { HeaderSearch } from "@/components/layout/header-search";
import { NotificationBell } from "@/components/notifications/notification-bell";
import { Button } from "@/components/ui/button";
import Link from "next/link";

const navItems = [
  { href: "/dashboard", label: "Overview", icon: DashboardSquare01Icon },
  { href: "/projects", label: "Projects", icon: Building03Icon },
  { href: "/warehouses", label: "Warehouses", icon: WarehouseIcon },
  { href: "/materials", label: "Materials", icon: PackageIcon },
  { href: "/inventory", label: "Inventory", icon: DeliveryTruck01Icon },
  { href: "/requests", label: "Material requests", icon: ClipboardListIcon, requests: true },
  { href: "/requests/queue", label: "Dispatch queue", icon: DeliveryTruck01Icon, dispatchQueue: true },
  { href: "/equipment", label: "Equipment", icon: ExcavatorIcon },
  { href: "/vehicles", label: "Vehicles", icon: Car01Icon },
  { href: "/qr-codes", label: "QR codes", icon: QrCodeIcon, manager: true },
  { href: "/employees", label: "Employees", icon: UserGroupIcon },
  { href: "/users", label: "Users", icon: UserGroupIcon, manager: true },
  { href: "/audit-logs", label: "Audit logs", icon: Audit01Icon, manager: true },
  { href: "/suppliers", label: "Suppliers", icon: Store02Icon, procurement: true },
  { href: "/purchase-orders", label: "Purchase orders", icon: ClipboardListIcon, procurement: true },
  { href: "/billing", label: "Billing", icon: File02Icon, finance: true },
  { href: "/reports/daily", label: "Daily reports", icon: File02Icon, reports: true },
] as const;

const HeaderContext = createContext<(content: React.ReactNode) => void>(() => {});
export const useWorkspaceHeader = () => useContext(HeaderContext);

export function WorkspaceShell({ children, userId, name, avatar, roleLabel, canViewProcurement, canViewFinance, canViewDailyReports, canViewRequests, canDispatchRequests, canManage }: { children: React.ReactNode; userId: string; name: string; avatar?: string; roleLabel: string; canViewProcurement: boolean; canViewFinance: boolean; canViewDailyReports: boolean; canViewRequests: boolean; canDispatchRequests: boolean; canManage: boolean }) {
  const [headerContext, setHeaderContext] = useState<React.ReactNode>(null);
  const items = navItems.filter((item) => (!("procurement" in item) || canViewProcurement) && (!("finance" in item) || canViewFinance) && (!("reports" in item) || canViewDailyReports) && (!("requests" in item) || canViewRequests) && (!("dispatchQueue" in item) || canDispatchRequests) && (!("manager" in item) || canManage));
  return <AppShell name={name} avatar={avatar} roleLabel={roleLabel} items={items} homeHref="/dashboard" headerContext={headerContext} headerSearch={<HeaderSearch />} headerActions={<>
    <NotificationBell userId={userId} />
  </>} profileActions={<><Link href="/profile" className="block rounded-lg px-3 py-2 text-sm text-slate-700 hover:bg-slate-50">My profile</Link><form action={logoutAction}><Button variant="ghost" className="w-full justify-start gap-2 px-3 text-sm" type="submit"><HugeiconsIcon icon={Logout01Icon} size={16} />Sign out</Button></form></>}><HeaderContext.Provider value={setHeaderContext}>{children}</HeaderContext.Provider></AppShell>;
}
