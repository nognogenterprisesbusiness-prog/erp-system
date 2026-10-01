"use client";

import { AssignmentsIcon, Audit01Icon, Building03Icon, DashboardSquare01Icon, File02Icon, FilePenLineIcon, Logout01Icon, Package01Icon, PackageReceiveIcon, QrCodeIcon, SearchDollarIcon, Store02Icon, Tag01Icon, UserGroupIcon, WarehouseIcon, HelpCircleIcon, Notification01Icon, UserCircleIcon } from "@hugeicons/core-free-icons";
import { HugeiconsIcon } from "@hugeicons/react";

import { logoutAction } from "@/app/auth/actions";
import { AppShell } from "@/components/layout/app-shell";
import { HeaderSearch } from "@/components/layout/header-search";
import { NotificationBell } from "@/components/notifications/notification-bell";
import { LiveRouteRefresh } from "@/components/layout/live-route-refresh";
import { Button } from "@/components/ui/button";
import { IntentLink as Link } from "@/components/layout/intent-link";
import { Suspense } from "react";
import { usePathname } from "next/navigation";

const navItems = [
  { href: "/dashboard", label: "Overview", icon: DashboardSquare01Icon, group: "Projects & operations" },
  { href: "/projects", label: "Projects", icon: Building03Icon, group: "Projects & operations" },
  { href: "/documents", label: "Documents", icon: File02Icon, reports: true, group: "Projects & operations" },
  { href: "/reports/daily", label: "Daily reports", icon: FilePenLineIcon, reports: true, group: "Projects & operations" },
  { href: "/inventory", label: "Inventory", icon: Package01Icon, group: "Materials & assets" },
  { href: "/warehouses", label: "Warehouses", icon: WarehouseIcon, group: "Materials & assets" },
  { href: "/requests", label: "Requests", icon: AssignmentsIcon, requests: true, group: "Materials & assets" },
  { href: "/purchase-orders/receive", label: "Receive deliveries", icon: PackageReceiveIcon, receiving: true, group: "Materials & assets" },
  { href: "/equipment/categories", label: "Asset classifications", icon: Tag01Icon, manager: true, nested: true, group: "Materials & assets" },
  { href: "/qr-codes", label: "QR tools", icon: QrCodeIcon, group: "Materials & assets" },
  { href: "/suppliers", label: "Suppliers & purchases", icon: Store02Icon, procurement: true, group: "Purchasing & finance" },
  { href: "/suppliers/prices", label: "Compare prices", icon: SearchDollarIcon, procurement: true, nested: true, group: "Purchasing & finance" },
  { href: "/suppliers/categories", label: "Categories", icon: Tag01Icon, manager: true, nested: true, group: "Purchasing & finance" },
  { href: "/billing", label: "Billing & payments", icon: File02Icon, finance: true, group: "Purchasing & finance" },
  { href: "/employees", label: "Employees", icon: UserGroupIcon, group: "People & administration" },
  { href: "/attendance", label: "Attendance", icon: AssignmentsIcon, nested: true, group: "People & administration" },
  { href: "/employees/categories", label: "Categories", icon: Tag01Icon, manager: true, nested: true, group: "People & administration" },
  { href: "/users", label: "Users", icon: UserGroupIcon, manager: true, group: "People & administration" },
  { href: "/audit-logs", label: "Audit logs", icon: Audit01Icon, manager: true, group: "People & administration" },
] as const;

export function WorkspaceShell({ children, userId, name, avatar, roleLabel, canViewProcurement, canViewFinance, canViewDailyReports, canViewRequests, canDispatchRequests, canManage }: { children: React.ReactNode; userId: string; name: string; avatar?: string; roleLabel: string; canViewProcurement: boolean; canViewFinance: boolean; canViewDailyReports: boolean; canViewRequests: boolean; canDispatchRequests: boolean; canManage: boolean }) {
  const pathname = usePathname();
  const items = navItems.filter((item) => (!("procurement" in item) || canViewProcurement) && (!("finance" in item) || canViewFinance) && (!("reports" in item) || canViewDailyReports) && (!("requests" in item) || canViewRequests || canDispatchRequests) && (!("receiving" in item) || canDispatchRequests) && (!("manager" in item) || canManage)).map((item) => item.href === "/qr-codes" && !canManage ? { ...item, href: "/scan" } : item);
  const activeHref = pathname.startsWith("/materials") || pathname.startsWith("/equipment") || pathname.startsWith("/vehicles") ? "/inventory" : pathname.startsWith("/purchase-orders/receive") ? "/purchase-orders/receive" : pathname.startsWith("/purchase-orders") ? "/suppliers" : pathname.startsWith("/scan") && canManage ? "/qr-codes" : undefined;
  return <><Suspense fallback={null}><LiveRouteRefresh userId={userId} /></Suspense><AppShell name={name} avatar={avatar} roleLabel={roleLabel} items={items} activeHref={activeHref} footerItems={[{ href: "/profile", label: "My profile", icon: UserCircleIcon }, { href: "/notifications", label: "Notifications", icon: Notification01Icon }, { href: "/help", label: "Help centre", icon: HelpCircleIcon }]} homeHref="/dashboard" headerSearch={<HeaderSearch />} headerActions={<>
    <NotificationBell userId={userId} />
  </>} profileActions={<><Link href="/profile" className="flex items-center gap-2 rounded-lg px-3 py-2 text-sm font-normal text-slate-700 hover:bg-slate-50"><HugeiconsIcon icon={UserCircleIcon} size={17} strokeWidth={1.7} />My profile</Link><form action={logoutAction}><Button variant="ghost" className="w-full justify-start gap-2 px-3 text-sm font-normal" type="submit"><HugeiconsIcon icon={Logout01Icon} size={17} strokeWidth={1.7} />Sign out</Button></form></>}>{children}</AppShell></>;
}
