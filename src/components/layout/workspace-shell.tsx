"use client";

import { AssignmentsIcon, Audit01Icon, Building03Icon, DashboardSquare01Icon, File02Icon, FilePenLineIcon, Logout01Icon, Invoice01Icon, Package01Icon, ShoppingCart01Icon, PackageReceiveIcon, QrCodeIcon, SearchDollarIcon, Store02Icon, Tag01Icon, UserGroupIcon, WarehouseIcon, HelpCircleIcon, Notification01Icon, UserCircleIcon } from "@hugeicons/core-free-icons";
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
  { href: "/dashboard", label: "Overview", icon: DashboardSquare01Icon, group: "Main work" },
  { href: "/projects", label: "Projects", icon: Building03Icon, group: "Main work" },
  { href: "/inventory", label: "Inventory", icon: Package01Icon, group: "Main work" },
  { href: "/requests", label: "Requests", icon: AssignmentsIcon, requests: true, group: "Main work" },
  { href: "/purchase-orders", label: "Purchasing", icon: ShoppingCart01Icon, procurement: true, group: "Main work" },
  { href: "/suppliers", label: "Suppliers", icon: Store02Icon, procurement: true, group: "Main work" },
  { href: "/site-purchases", label: "Site purchases", icon: Invoice01Icon, sitePurchases: true, quickSitePurchase: true, group: "Main work" },
  { href: "/purchase-orders/receive", label: "Receive deliveries", icon: PackageReceiveIcon, receiving: true, quickReceiving: true, group: "Main work" },
  { href: "/billing", label: "Billing & payments", icon: File02Icon, finance: true, group: "Main work" },
  { href: "/documents", label: "Project documents", icon: File02Icon, reports: true, group: "Project tools" },
  { href: "/reports/daily", label: "Daily reports", icon: FilePenLineIcon, reports: true, group: "Project tools" },
  { href: "/warehouses", label: "Warehouses", icon: WarehouseIcon, group: "Inventory tools" },
  { href: "/qr-codes", label: "QR tools", icon: QrCodeIcon, group: "Inventory tools" },
  { href: "/equipment/categories", label: "Asset classifications", icon: Tag01Icon, manager: true, group: "Inventory tools" },
  { href: "/suppliers/prices", label: "Compare supplier prices", icon: SearchDollarIcon, procurement: true, group: "Purchasing tools" },
  { href: "/suppliers/categories", label: "Supplier categories", icon: Tag01Icon, manager: true, group: "Purchasing tools" },
  { href: "/site-purchases", label: "Site purchases", icon: Invoice01Icon, financeSitePurchase: true, group: "Purchasing tools" },
  { href: "/employees", label: "Employees", icon: UserGroupIcon, group: "People" },
  { href: "/attendance", label: "Attendance", icon: AssignmentsIcon, finance: true, group: "People" },
  { href: "/employees/categories", label: "Employee categories", icon: Tag01Icon, manager: true, group: "People" },
  { href: "/users", label: "User access", icon: UserGroupIcon, manager: true, group: "Administration" },
  { href: "/audit-logs", label: "Audit history", icon: Audit01Icon, manager: true, group: "Administration" },
] as const;

export function WorkspaceShell({ children, userId, name, avatar, roleLabel, canViewProcurement, canViewFinance, canViewDailyReports, canViewRequests, canDispatchRequests, canManage, canSubmitSitePurchases }: { children: React.ReactNode; userId: string; name: string; avatar?: string; roleLabel: string; canViewProcurement: boolean; canViewFinance: boolean; canViewDailyReports: boolean; canViewRequests: boolean; canDispatchRequests: boolean; canManage: boolean; canSubmitSitePurchases: boolean }) {
  const pathname = usePathname();
  const items = navItems.filter((item) => {
    if ("quickReceiving" in item) return canDispatchRequests && !canManage;
    if ("quickSitePurchase" in item) return canSubmitSitePurchases && !canManage;
    if ("financeSitePurchase" in item) return canViewFinance;
    return (!("procurement" in item) || canViewProcurement) && (!("finance" in item) || canViewFinance) && (!("reports" in item) || canViewDailyReports) && (!("requests" in item) || canViewRequests || canDispatchRequests) && (!("receiving" in item) || (canDispatchRequests && !canManage)) && (!("sitePurchases" in item) || canViewFinance || canSubmitSitePurchases) && (!("manager" in item) || canManage);
  }).map((item) => item.href === "/qr-codes" && !canManage ? { ...item, href: "/scan" } : item);
  const activeHref = pathname.startsWith("/materials") || pathname.startsWith("/equipment") || pathname.startsWith("/vehicles") ? "/inventory" : pathname.startsWith("/purchase-orders/receive") ? "/purchase-orders/receive" : pathname.startsWith("/purchase-orders") ? "/purchase-orders" : pathname.startsWith("/scan") && canManage ? "/qr-codes" : undefined;
  return <><Suspense fallback={null}><LiveRouteRefresh userId={userId} /></Suspense><AppShell name={name} avatar={avatar} roleLabel={roleLabel} items={items} activeHref={activeHref} footerItems={[{ href: "/profile", label: "My profile", icon: UserCircleIcon }, { href: "/notifications", label: "Notifications", icon: Notification01Icon }, { href: "/help", label: "Help centre", icon: HelpCircleIcon }]} homeHref="/dashboard" headerSearch={<HeaderSearch />} headerActions={<>
    <NotificationBell userId={userId} />
  </>} profileActions={<><Link href="/profile" className="flex items-center gap-2 rounded-lg px-3 py-2 text-sm font-normal text-slate-700 hover:bg-slate-50"><HugeiconsIcon icon={UserCircleIcon} size={17} strokeWidth={1.7} />My profile</Link><form action={logoutAction}><Button variant="ghost" className="w-full justify-start gap-2 px-3 text-sm font-normal" type="submit"><HugeiconsIcon icon={Logout01Icon} size={17} strokeWidth={1.7} />Sign out</Button></form></>}>{children}</AppShell></>;
}
