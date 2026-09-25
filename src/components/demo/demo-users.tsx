"use client";

import { useEffect, useRef, useState, type FormEvent } from "react";
import Image from "next/image";
import { PlusSignIcon } from "@hugeicons/core-free-icons";
import { HugeiconsIcon } from "@hugeicons/react";

import { Button } from "@/components/ui/button";
import { DataTableShell } from "@/components/ui/data-table-shell";
import { DialogHeading } from "@/components/ui/dialog-heading";
import { EmptyState } from "@/components/ui/empty-state";
import { fieldControlClass } from "@/components/ui/form-field";
import { SelectPicker } from "@/components/ui/select-picker";
import { assignDemoProject, assignDemoWarehouse, getDemoDatabase, registerDemoUser, setDemoUserActive } from "@/lib/demo/database";
import { demoRoles, type DemoData } from "@/lib/demo/schema";
import { canAssignInitialRole, canManageAccount, roleLabels } from "@/lib/users/access";
import { DemoRecordDetailDialog } from "./demo-record-detail-dialog";

export function DemoUsers({ tables, selectedUserId, action, onChanged }: { tables: DemoData; selectedUserId: string; action?: string | null; onChanged: (message: string) => Promise<void> }) {
  const [busy, setBusy] = useState(false);
  const [pageError, setPageError] = useState("");
  const [modalError, setModalError] = useState("");
  const [newRole, setNewRole] = useState("");
  const [formKey, setFormKey] = useState(0);
  const [viewingId, setViewingId] = useState<string | null>(null);
  const addDialog = useRef<HTMLDialogElement>(null);
  const accessDialog = useRef<HTMLDialogElement>(null);
  const actor = tables.users.find((user) => user.id === selectedUserId);
  const assignableRoles = demoRoles.filter((role) => actor && canAssignInitialRole([actor.role], role));
  const projectUsers = tables.users.filter((user) => user.isActive !== false && ["project_manager", "engineer", "foreman"].includes(user.role));
  const warehouseUsers = tables.users.filter((user) => user.isActive !== false && user.role === "warehouse_staff");
  const viewingUser = tables.users.find((user) => user.id === viewingId);
  const projectNames = viewingUser ? tables.projectAssignments.filter((row) => row.userId === viewingUser.id).map((row) => tables.projects.find((project) => project.id === row.projectId)?.name).filter(Boolean).join(", ") : "";
  const warehouseNames = viewingUser ? tables.warehouseMemberships.filter((row) => row.userId === viewingUser.id).map((row) => tables.warehouses.find((warehouse) => warehouse.id === row.warehouseId)?.name).filter(Boolean).join(", ") : "";

  useEffect(() => {
    if (action === "add" && assignableRoles.length && !addDialog.current?.open) addDialog.current?.showModal();
    if (action === "access" && assignableRoles.length && !accessDialog.current?.open) accessDialog.current?.showModal();
  }, [action, actor, assignableRoles.length]);

  function resetModal() {
    setModalError("");
    setNewRole("");
    setFormKey((value) => value + 1);
    const url = new URL(window.location.href);
    if (url.searchParams.has("action")) {
      url.searchParams.delete("action");
      window.history.replaceState(null, "", `${url.pathname}${url.search}`);
    }
  }

  async function addUser(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (busy) return;
    setBusy(true); setModalError("");
    const data = new FormData(event.currentTarget);
    try {
      if (!newRole) throw new Error("Choose a role.");
      await registerDemoUser(getDemoDatabase(), { name: String(data.get("name") ?? ""), email: String(data.get("email") ?? "").trim().toLowerCase(), role: newRole as (typeof demoRoles)[number] });
      await onChanged("User added to this demo workspace.");
      addDialog.current?.close();
    } catch (cause) { setModalError(cause instanceof Error ? cause.message : "Unable to add this user."); }
    finally { setBusy(false); }
  }

  async function changeStatus(id: string, active: boolean) {
    setBusy(true); setPageError("");
    try {
      await setDemoUserActive(getDemoDatabase(), id, active);
      await onChanged(active ? "User enabled." : "User disabled.");
    } catch (cause) { setPageError(cause instanceof Error ? cause.message : "Unable to update this user."); }
    finally { setBusy(false); }
  }

  async function assign(event: FormEvent<HTMLFormElement>, kind: "project" | "warehouse") {
    event.preventDefault();
    if (busy) return;
    setBusy(true); setModalError("");
    const data = new FormData(event.currentTarget);
    try {
      const userId = String(data.get("userId") ?? "");
      if (kind === "project") await assignDemoProject(getDemoDatabase(), { userId, projectId: String(data.get("projectId") ?? "") });
      else await assignDemoWarehouse(getDemoDatabase(), { userId, warehouseId: String(data.get("warehouseId") ?? "") });
      await onChanged(kind === "project" ? "Project access assigned." : "Warehouse access assigned.");
      accessDialog.current?.close();
    } catch (cause) { setModalError(cause instanceof Error ? cause.message : "Unable to assign access."); }
    finally { setBusy(false); }
  }

  return <>
    <div className="mb-5 flex flex-wrap justify-end gap-2">
      {assignableRoles.length > 0 && <Button variant="outline" onClick={() => accessDialog.current?.showModal()}>Manage access</Button>}
      {assignableRoles.length > 0 && <Button onClick={() => addDialog.current?.showModal()}><HugeiconsIcon icon={PlusSignIcon} size={17} strokeWidth={1.6} />Add user</Button>}
    </div>
    {pageError && <p role="alert" className="mb-4 rounded-lg bg-red-50 p-3 text-sm text-red-700">{pageError}</p>}
    <DataTableShell empty={tables.users.length ? undefined : <EmptyState kind="items" title="No user accounts yet" />} footer={<p className="text-xs text-slate-500">{tables.users.length} users</p>}>
      <table className="w-full min-w-[620px] text-left text-sm"><thead className="bg-slate-50 text-slate-600"><tr><th scope="col" className="px-5 py-3">User</th><th scope="col" className="px-5 py-3">Role</th><th scope="col" className="px-5 py-3">Status</th><th scope="col" className="px-5 py-3 text-right">Action</th></tr></thead><tbody className="divide-y divide-slate-100">{tables.users.map((user) => <tr key={user.id}><td className="px-5 py-4"><button type="button" onClick={() => setViewingId(user.id)} className="flex items-center gap-3 text-left hover:text-cyan-700"><span className="relative grid size-9 shrink-0 place-items-center overflow-hidden rounded-full bg-cyan-50 text-xs font-semibold text-cyan-700">{user.photo ? <Image src={user.photo} alt="" fill sizes="36px" unoptimized className="object-cover" /> : user.name.split(/\s+/).map((part) => part[0]).slice(0, 2).join("").toUpperCase()}</span><span><span className="block font-semibold">{user.name}</span><span className="text-xs text-slate-500">{user.email ?? "—"}</span></span></button></td><td className="px-5 py-4 text-slate-600">{roleLabels[user.role]}</td><td className="px-5 py-4 font-medium">{user.isActive === false ? "Disabled" : "Enabled"}</td><td className="px-5 py-4 text-right">{actor && canManageAccount(actor.id, [actor.role], user.id, [user.role]) ? <Button size="sm" variant="outline" disabled={busy} onClick={() => void changeStatus(user.id, user.isActive === false)}>{user.isActive === false ? "Enable" : "Disable"}</Button> : <span className="text-xs text-slate-400">{user.id === selectedUserId ? "Current account" : "View only"}</span>}</td></tr>)}</tbody></table>
    </DataTableShell>
    {viewingUser && <DemoRecordDetailDialog name={viewingUser.name} photo={viewingUser.photo} details={[{ label: "Role", value: roleLabels[viewingUser.role] }, { label: "Email", value: viewingUser.email ?? "—" }, { label: "Phone", value: viewingUser.phone ?? "—" }, { label: "Status", value: viewingUser.isActive === false ? "Disabled" : "Enabled" }, { label: "Projects", value: projectNames || "None assigned" }, { label: "Warehouses", value: warehouseNames || "None assigned" }]} onClose={() => setViewingId(null)} />}

    <dialog ref={addDialog} onClose={resetModal} onCancel={(event) => { if (busy) event.preventDefault(); }} aria-labelledby="demo-add-user-title" className="m-auto w-[min(100%-2rem,460px)] rounded-2xl border border-slate-200 bg-white p-6 text-[#07152d] shadow-2xl backdrop:bg-slate-950/45">
      <form key={formKey} onSubmit={(event) => void addUser(event)} className="grid gap-4">
        <DialogHeading id="demo-add-user-title" title="Add user" onClose={() => addDialog.current?.close()} disabled={busy} />
        <label className="grid gap-1.5 text-xs font-medium text-slate-600">Name<input className={fieldControlClass} name="name" autoComplete="name" minLength={2} maxLength={160} required /></label>
        <label className="grid gap-1.5 text-xs font-medium text-slate-600">Email<input className={fieldControlClass} name="email" type="email" autoComplete="email" required /></label>
        <label className="grid gap-1.5 text-xs font-medium text-slate-600">Role<SelectPicker label="Role" name="role" value={newRole} onValueChange={setNewRole} placeholder="Select role" options={assignableRoles.map((role) => ({ value: role, label: roleLabels[role] }))} /></label>
        {modalError && <p role="alert" className="text-sm text-red-700">{modalError}</p>}
        <div className="flex justify-end gap-2"><Button type="button" variant="outline" onClick={() => addDialog.current?.close()} disabled={busy}>Cancel</Button><Button type="submit" disabled={busy || !newRole}>{busy ? "Saving…" : "Save"}</Button></div>
      </form>
    </dialog>

    <dialog ref={accessDialog} onClose={resetModal} onCancel={(event) => { if (busy) event.preventDefault(); }} aria-labelledby="demo-access-title" className="m-auto max-h-[90svh] w-[min(100%-2rem,680px)] overflow-y-auto rounded-2xl border border-slate-200 bg-white p-6 text-[#07152d] shadow-2xl backdrop:bg-slate-950/45">
      <DialogHeading id="demo-access-title" title="Manage access" onClose={() => accessDialog.current?.close()} disabled={busy} />
      <div key={formKey} className="mt-5 grid gap-6 sm:grid-cols-2">
        <form onSubmit={(event) => void assign(event, "project")} className="grid content-start gap-3"><h3 className="text-sm font-semibold">Project access</h3><SelectPicker name="userId" label="Project user" defaultValue={projectUsers[0]?.id} options={projectUsers.map((user) => ({ value: user.id, label: user.name }))} /><SelectPicker name="projectId" label="Project" defaultValue={tables.projects[0]?.id} options={tables.projects.map((project) => ({ value: project.id, label: project.name }))} /><Button type="submit" disabled={busy || !projectUsers.length || !tables.projects.length}>Assign project</Button></form>
        <form onSubmit={(event) => void assign(event, "warehouse")} className="grid content-start gap-3"><h3 className="text-sm font-semibold">Warehouse access</h3><SelectPicker name="userId" label="Warehouse user" defaultValue={warehouseUsers[0]?.id} options={warehouseUsers.map((user) => ({ value: user.id, label: user.name }))} /><SelectPicker name="warehouseId" label="Warehouse" defaultValue={tables.warehouses[0]?.id} options={tables.warehouses.map((warehouse) => ({ value: warehouse.id, label: warehouse.name }))} /><Button type="submit" disabled={busy || !warehouseUsers.length || !tables.warehouses.length}>Assign warehouse</Button></form>
      </div>
      {modalError && <p role="alert" className="mt-4 text-sm text-red-700">{modalError}</p>}
      <details className="mt-5 border-t border-slate-100 pt-4 text-xs text-slate-500"><summary className="cursor-pointer font-medium text-cyan-700">View {tables.projectAssignments.length + tables.warehouseMemberships.length} assignments</summary><ul className="mt-2 max-h-48 space-y-1 overflow-y-auto">{tables.projectAssignments.map((row) => <li key={row.id}>{tables.users.find((user) => user.id === row.userId)?.name} → {tables.projects.find((project) => project.id === row.projectId)?.name}</li>)}{tables.warehouseMemberships.map((row) => <li key={row.id}>{tables.users.find((user) => user.id === row.userId)?.name} → {tables.warehouses.find((warehouse) => warehouse.id === row.warehouseId)?.name}</li>)}</ul></details>
    </dialog>
  </>;
}
