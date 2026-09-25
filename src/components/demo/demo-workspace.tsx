"use client";

import { useEffect, useRef, useState } from "react";
import { useSearchParams } from "next/navigation";
import { AssignmentsIcon, Audit01Icon, Building03Icon, Calendar03Icon, DashboardSquare01Icon, DeliveryTruck01Icon, ExcavatorIcon, FilePenLineIcon, HandshakeIcon, HelpCircleIcon, Logout01Icon, QrCodeIcon, Settings02Icon, Store02Icon, UserGroupIcon, WarehouseIcon } from "@hugeicons/core-free-icons";
import { HugeiconsIcon } from "@hugeicons/react";

import { AppShell } from "@/components/layout/app-shell";
import { HistoryLink } from "@/components/layout/history-link";
import { Button } from "@/components/ui/button";
import { DialogHeading } from "@/components/ui/dialog-heading";
import { SelectPicker } from "@/components/ui/select-picker";
import { PageSkeleton } from "@/components/ui/page-skeleton";
import { exportDemo, getDemoDatabase, getSavedSnapshotInfo, importDemo, markDemoNotificationRead, markDemoNotificationsUnread, readDemo, resetDemo, restoreDemoSnapshot, saveDemoSnapshot, selectDemoUser } from "@/lib/demo/database";
import { demoRoleViews, isDemoView, type DemoView } from "@/lib/demo/navigation";
import { demoRoles } from "@/lib/demo/schema";
import { visibleDemoProjectIds, visibleDemoWarehouseIds } from "@/lib/demo/visibility";
import { DemoBanner } from "./demo-banner";
import { DemoAuditLogs } from "./demo-audit-logs";
import { DemoAttendance } from "./demo-attendance";
import { DemoDashboard } from "./demo-dashboard";
import { DemoDataset } from "./demo-dataset";
import { DemoEmployees } from "./demo-employees";
import { DemoEquipmentRequests } from "./demo-equipment-requests";
import { DemoHelp } from "./demo-help";
import { DemoNotificationBell } from "./demo-notification-bell";
import { DemoProjects } from "./demo-projects";
import { DemoQrCodes } from "./demo-qr-codes";
import { DemoRegistry } from "./demo-registry";
import { DemoUsers } from "./demo-users";
import { DemoQuickSearch } from "./demo-quick-search";
import { DemoRequests } from "./demo-requests";
import { DemoSettings } from "./demo-settings";
import { DemoWarehouses } from "./demo-warehouses";

const views = [
  { id: "overview", label: "Overview", icon: DashboardSquare01Icon },
  { id: "projects", label: "Projects", icon: Building03Icon },
  { id: "warehouses", label: "Warehouses", icon: WarehouseIcon },
  { id: "inventory", label: "Inventory", icon: DeliveryTruck01Icon },
  { id: "requests", label: "Material requests", icon: AssignmentsIcon },
  { id: "equipment", label: "Equipment", icon: ExcavatorIcon },
  { id: "equipment-requests", label: "Equipment handovers", icon: HandshakeIcon },
  { id: "workforce", label: "Employees", icon: UserGroupIcon },
  { id: "attendance", label: "Attendance", icon: Calendar03Icon },
  { id: "suppliers", label: "Suppliers", icon: Store02Icon },
  { id: "reports", label: "Daily reports", icon: FilePenLineIcon },
  { id: "qr", label: "QR codes", icon: QrCodeIcon },
  { id: "users", label: "Users", icon: UserGroupIcon },
  { id: "audit", label: "Audit logs", icon: Audit01Icon },
] as const;
const footerViews = [
  { id: "help", label: "Help centre", icon: HelpCircleIcon },
  { id: "settings", label: "Settings", icon: Settings02Icon },
] as const;
type WorkspaceData = Awaited<ReturnType<typeof readDemo>>;

export function DemoWorkspace({ canExitToLive }: { canExitToLive: boolean }) {
  const searchParams = useSearchParams();
  const requestedView = searchParams.get("view");
  const view: DemoView = isDemoView(requestedView) ? requestedView : "overview";
  const query = (searchParams.get("q") ?? "").slice(0, 80);
  const [data, setData] = useState<WorkspaceData>();
  const [signedOut, setSignedOut] = useState(false);
  const [savedAt, setSavedAt] = useState<string | null>(null);
  const [message, setMessage] = useState("");
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);
  const resetDialog = useRef<HTMLDialogElement>(null);
  const restoreDialog = useRef<HTMLDialogElement>(null);

  useEffect(() => {
    queueMicrotask(() => setSignedOut(window.sessionStorage.getItem("nognog.demo.paused") === "1"));
    const db = getDemoDatabase();
    readDemo(db).then(async (result) => {
      setData(result);
      setSavedAt((await getSavedSnapshotInfo(db))?.savedAt ?? null);
    }).catch((cause: unknown) => setError(cause instanceof Error ? cause.message : "Demo storage is unavailable."));
  }, []);

  useEffect(() => {
    if (requestedView === "search") window.history.replaceState(null, "", "/demo");
  }, [requestedView]);

  const user = data?.snapshot.tables.users.find((item) => item.id === data.selectedUserId);
  const allowed = demoRoleViews[user?.role ?? "admin"];
  const currentView = allowed.includes(view) ? view : "overview";
  const navItems = views.filter((item) => allowed.includes(item.id)).map((item) => ({ href: item.id === "overview" ? "/demo" : `/demo?view=${item.id}`, label: item.label, icon: item.icon }));
  const footerItems = footerViews.map((item) => ({ href: `/demo?view=${item.id}`, label: item.label, icon: item.icon }));
  const activeHref = currentView === "overview" ? "/demo" : `/demo?view=${currentView}`;
  const tables = data?.snapshot.tables;
  const warehouseIds = tables && user ? visibleDemoWarehouseIds(tables, user.role, user.id) : new Set<string>();
  const projectIds = tables && user ? visibleDemoProjectIds(tables, user.role, user.id) : new Set<string>();
  const locationOptions = currentView === "inventory" ? [
    ...(tables?.warehouses.filter((item) => warehouseIds.has(item.id)).map((item) => ({ value: item.id, label: item.name })) ?? []),
    ...(user && ["admin", "owner", "super_admin"].includes(user.role) ? tables?.sites.filter((site) => projectIds.has(site.projectId)).map((site) => ({ value: site.id, label: `${site.name} · Site` })) ?? [] : []),
  ] : [];
  const requestedLocation = searchParams.get("location") ?? "";
  const defaultStockLocation = locationOptions.find((item) => tables?.balances.some((balance) => balance.warehouseId === item.value))?.value ?? locationOptions.find((item) => tables?.siteBalances.some((balance) => balance.siteId === item.value))?.value;
  const selectedLocation = locationOptions.some((item) => item.value === requestedLocation) ? requestedLocation : defaultStockLocation ?? locationOptions[0]?.value ?? "";

  function changeLocation(locationId: string) {
    const url = new URL(window.location.href);
    url.searchParams.set("location", locationId);
    url.searchParams.delete("action");
    window.history.pushState(null, "", `${url.pathname}${url.search}`);
  }

  function leaveDemo() {
    window.sessionStorage.setItem("nognog.demo.paused", "1");
    setSignedOut(true);
  }

  function resumeDemo() {
    window.sessionStorage.removeItem("nognog.demo.paused");
    setSignedOut(false);
  }

  async function readNotification(notificationId: string) {
    if (!data) return;
    try {
      await markDemoNotificationRead(getDemoDatabase(), notificationId, data.selectedUserId);
      setData(await readDemo(getDemoDatabase()));
      setError("");
    } catch (cause) { setError(cause instanceof Error ? cause.message : "Unable to update notification."); }
  }

  async function unreadNotifications() {
    if (!data) return;
    try {
      await markDemoNotificationsUnread(getDemoDatabase(), data.selectedUserId);
      setData(await readDemo(getDemoDatabase()));
      setError("");
    } catch (cause) { setError(cause instanceof Error ? cause.message : "Unable to update notifications."); }
  }

  async function refreshDemo(messageText: string) {
    setData(await readDemo(getDemoDatabase()));
    setMessage(messageText);
    setError("");
  }

  async function switchUser(userId: string) {
    try {
      await selectDemoUser(getDemoDatabase(), userId);
      const next = await readDemo(getDemoDatabase());
      setData(next);
      const nextRole = next.snapshot.tables.users.find((item) => item.id === userId)?.role;
      if (nextRole && !demoRoleViews[nextRole].includes(view)) window.history.replaceState(null, "", "/demo");
      setError("");
    } catch (cause) { setError(cause instanceof Error ? cause.message : "Unable to switch demo user."); }
  }

  async function downloadExport() {
    try {
      const json = await exportDemo(getDemoDatabase());
      const url = URL.createObjectURL(new Blob([json], { type: "application/json" }));
      const link = document.createElement("a");
      link.href = url;
      link.download = `nognog-demo-${new Date().toISOString().slice(0, 10)}.json`;
      link.click();
      setTimeout(() => URL.revokeObjectURL(url), 1000);
      setMessage("Demo data exported.");
      setError("");
    } catch (cause) { setError(cause instanceof Error ? cause.message : "Export failed."); }
  }

  async function uploadImport(file: File) {
    setBusy(true);
    try {
      if (file.size > 2_000_000) throw new Error("Demo import exceeds the 2 MB limit.");
      await importDemo(getDemoDatabase(), await file.text());
      setData(await readDemo(getDemoDatabase()));
      setMessage("Demo data imported.");
      setError("");
    } catch (cause) { setError(cause instanceof Error ? cause.message : "Import failed. Existing demo data was preserved."); setMessage(""); }
    finally { setBusy(false); }
  }

  async function saveSnapshot() {
    if (savedAt && !window.confirm("Replace the previously saved local demo snapshot?")) return;
    setBusy(true);
    try {
      setSavedAt((await saveDemoSnapshot(getDemoDatabase())).savedAt);
      setMessage("Demo snapshot saved on this device.");
      setError("");
    } catch (cause) { setError(cause instanceof Error ? cause.message : "Snapshot save failed."); }
    finally { setBusy(false); }
  }

  async function confirmRestore() {
    setBusy(true);
    try {
      await restoreDemoSnapshot(getDemoDatabase());
      setData(await readDemo(getDemoDatabase()));
      setMessage("Demo snapshot restored.");
      setError("");
      restoreDialog.current?.close();
    } catch (cause) { setError(cause instanceof Error ? cause.message : "Snapshot restore failed."); }
    finally { setBusy(false); }
  }

  async function confirmReset() {
    setBusy(true);
    try {
      await resetDemo(getDemoDatabase());
      setData(await readDemo(getDemoDatabase()));
      setMessage("Demo data restored.");
      setError("");
      resetDialog.current?.close();
    } catch (cause) { setError(cause instanceof Error ? cause.message : "Reset failed."); }
    finally { setBusy(false); }
  }

  if (signedOut) return <div className="grid min-h-svh place-items-center bg-[#f5f6f8] px-4"><div className="w-full max-w-sm rounded-2xl border border-slate-200 bg-white p-8 text-center shadow-sm"><p className="text-xs font-semibold uppercase tracking-[0.18em] text-cyan-700">Nognog Enterprises</p><h1 className="mt-3 text-2xl font-semibold">You left the demo workspace</h1><p className="mt-3 text-sm leading-6 text-slate-500">This was a local preview, not an authenticated account. Your demo data remains on this device.</p><Button className="mt-6 w-full" onClick={resumeDemo}>Return to demo</Button></div></div>;

  return <>
    <AppShell
       banner={<DemoBanner controls={<SelectPicker label="Current account" value={data?.selectedUserId} onValueChange={(value) => void switchUser(value)} disabled={!data} options={data?.snapshot.tables.users.filter((item) => item.isActive !== false).toSorted((a, b) => demoRoles.indexOf(a.role) - demoRoles.indexOf(b.role)).map((item) => ({ value: item.id, label: item.name })) ?? []} className="h-8 max-w-[160px] border-cyan-200/30 bg-white/10 text-sm font-semibold text-white focus-visible:ring-cyan-200 sm:max-w-none" />} />}
      name={user?.name ?? "Demo user"}
      roleLabel={user?.role ?? "demo"}
      items={navItems}
      footerItems={footerItems}
      footerAction={{ label: "Logout", icon: Logout01Icon, onClick: leaveDemo }}
      homeHref="/demo"
      activeHref={activeHref}
      navigationMode="history"
      avatar={user?.photo}
      headerSearch={<DemoQuickSearch tables={data?.snapshot.tables} role={user?.role ?? "worker"} userId={user?.id} initialQuery={requestedView === "search" ? query : ""} />}
      headerActions={<DemoNotificationBell notifications={data?.snapshot.tables.notifications.filter((item) => item.userId === data.selectedUserId) ?? []} onRead={(id) => void readNotification(id)} onMarkAllUnread={() => void unreadNotifications()} />}
      profileActions={<><HistoryLink href="/demo?view=settings" className="flex items-center gap-2 rounded-lg px-3 py-2 text-sm text-slate-700 hover:bg-slate-50"><HugeiconsIcon icon={Settings02Icon} size={16} />Settings</HistoryLink><button type="button" onClick={leaveDemo} className="flex w-full items-center gap-2 rounded-lg px-3 py-2 text-left text-sm text-slate-700 hover:bg-slate-50"><HugeiconsIcon icon={Logout01Icon} size={16} />Logout</button></>}
    >
      {!(currentView === "projects" && searchParams.has("project")) && <div className={currentView === "settings" || currentView === "help" ? "mx-auto mb-7 max-w-3xl" : "mb-7"}><h1 className="text-2xl font-semibold tracking-[-0.035em] sm:text-3xl">{currentView === "overview" ? "Dashboard" : currentView === "settings" ? "Settings" : currentView === "help" ? "Help centre" : views.find((item) => item.id === currentView)?.label}</h1>{currentView === "overview" || currentView === "help" ? <p className="mt-1 text-sm text-slate-500">{currentView === "overview" ? `Welcome back, ${user?.name ?? "user"}.` : "Step-by-step guides for common workflows"}</p> : null}</div>}
      {error ? <p role="alert" className="mb-5 rounded-lg border border-red-200 bg-red-50 p-3 text-sm text-red-700">{error}</p> : null}
      {message ? <p role="status" className="mb-5 rounded-lg border border-emerald-200 bg-emerald-50 p-3 text-sm text-emerald-700">{message}</p> : null}
      {!data && !error ? <PageSkeleton variant={currentView === "overview" ? "dashboard" : "table"} showHeading={false} /> : null}
      {data && currentView === "overview" ? <DemoDashboard tables={data.snapshot.tables} role={user?.role ?? "admin"} userId={data.selectedUserId} /> : null}
      {data && user && currentView === "settings" ? <DemoSettings key={`${user.id}:${user.name}:${user.email ?? ""}:${user.phone ?? ""}`} user={user} onProfileSaved={async () => { await refreshDemo("Profile updated."); }} savedAt={savedAt} busy={busy} canExitToLive={canExitToLive} onSave={() => void saveSnapshot()} onRestore={() => restoreDialog.current?.showModal()} onExport={() => void downloadExport()} onImport={(file) => void uploadImport(file)} onReset={() => resetDialog.current?.showModal()} /> : null}
      {data && currentView === "help" ? <DemoHelp topic={searchParams.get("topic")} role={user?.role ?? "admin"} /> : null}
      {data && currentView === "audit" ? <DemoAuditLogs tables={data.snapshot.tables} /> : null}
      {data && currentView === "qr" ? <DemoQrCodes tables={data.snapshot.tables} /> : null}
      {data && currentView === "warehouses" ? <DemoWarehouses tables={data.snapshot.tables} role={user?.role ?? "admin"} userId={data.selectedUserId} action={searchParams.get("action")} onChanged={refreshDemo} /> : null}
      {data && (currentView === "inventory" || currentView === "equipment") ? <DemoRegistry key={`${currentView}:${searchParams.get("action") ?? ""}`} kind={currentView} tables={data.snapshot.tables} role={user?.role ?? "admin"} userId={data.selectedUserId} selectedLocationId={selectedLocation} locationOptions={locationOptions} onLocationChange={changeLocation} action={searchParams.get("action")} onChanged={refreshDemo} /> : null}
      {data && currentView === "equipment-requests" ? <DemoEquipmentRequests key={data.selectedUserId} tables={data.snapshot.tables} role={user?.role ?? "admin"} userId={data.selectedUserId} onChanged={refreshDemo} /> : null}
      {data && currentView === "requests" ? <DemoRequests key={`${data.selectedUserId}:${searchParams.get("action") ?? ""}`} tables={data.snapshot.tables} role={user?.role ?? "admin"} userId={data.selectedUserId} action={searchParams.get("action")} onChanged={refreshDemo} /> : null}
      {data && currentView === "users" ? <DemoUsers tables={data.snapshot.tables} selectedUserId={data.selectedUserId} action={searchParams.get("action")} onChanged={refreshDemo} /> : null}
      {data && currentView === "workforce" ? <DemoEmployees employees={data.snapshot.tables.employees} users={data.snapshot.tables.users} role={user?.role ?? "admin"} action={searchParams.get("action")} onChanged={refreshDemo} /> : null}
      {data && currentView === "attendance" ? <DemoAttendance tables={data.snapshot.tables} role={user?.role ?? "admin"} action={searchParams.get("action")} projectId={searchParams.get("project")} onChanged={refreshDemo} /> : null}
      {data && currentView === "projects" ? <DemoProjects tables={data.snapshot.tables} role={user?.role ?? "admin"} userId={data.selectedUserId} action={searchParams.get("action")} projectId={searchParams.get("project")} tab={searchParams.get("tab")} onChanged={refreshDemo} /> : null}
      {data && (currentView === "suppliers" || currentView === "reports") ? <DemoDataset kind={currentView} tables={data.snapshot.tables} role={user?.role ?? "admin"} userId={data.selectedUserId} action={searchParams.get("action")} onChanged={refreshDemo} /> : null}
    </AppShell>
    <dialog ref={resetDialog} className="m-auto w-[min(100%-2rem,440px)] rounded-xl border border-slate-200 bg-white p-6 text-[#07152d] shadow-2xl backdrop:bg-slate-900/40" aria-labelledby="demo-reset-title">
      <DialogHeading id="demo-reset-title" title="Reset demo data?" onClose={() => resetDialog.current?.close()} disabled={busy} />
      <p className="mt-2 text-sm leading-6 text-slate-600">This replaces local demo records, transaction history, and notifications with the original seed. You can export your data first. Live company data is never touched.</p>
      <div className="mt-5 flex flex-wrap justify-end gap-2"><Button variant="ghost" size="sm" onClick={() => resetDialog.current?.close()} disabled={busy}>Cancel</Button><Button variant="outline" size="sm" onClick={downloadExport} disabled={busy}>Export first</Button><Button size="sm" onClick={confirmReset} disabled={busy}>Reset demo</Button></div>
    </dialog>
    <dialog ref={restoreDialog} className="m-auto w-[min(100%-2rem,440px)] rounded-xl border border-slate-200 bg-white p-6 text-[#07152d] shadow-2xl backdrop:bg-slate-900/40" aria-labelledby="demo-restore-title">
      <DialogHeading id="demo-restore-title" title="Restore saved snapshot?" onClose={() => restoreDialog.current?.close()} disabled={busy} />
      <p className="mt-2 text-sm leading-6 text-slate-600">Your current local demo records will be replaced by the saved snapshot. Export the current data first if you want to keep it. Live data is never touched.</p>
      <div className="mt-5 flex flex-wrap justify-end gap-2"><Button variant="ghost" size="sm" onClick={() => restoreDialog.current?.close()} disabled={busy}>Cancel</Button><Button variant="outline" size="sm" onClick={downloadExport} disabled={busy}>Export first</Button><Button size="sm" onClick={confirmRestore} disabled={busy}>Restore snapshot</Button></div>
    </dialog>
  </>;
}
