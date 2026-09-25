"use client";

import { useEffect, useRef, useState, type FormEvent } from "react";
import Image from "next/image";
import { PlusSignIcon } from "@hugeicons/core-free-icons";
import { HugeiconsIcon } from "@hugeicons/react";

import { Button } from "@/components/ui/button";
import { DataTableShell } from "@/components/ui/data-table-shell";
import { DialogHeading } from "@/components/ui/dialog-heading";
import { EmptyState } from "@/components/ui/empty-state";
import { RecordPhotoInput } from "@/components/ui/record-photo-input";
import { SearchField } from "@/components/ui/search-field";
import { RegistryToolbar } from "@/components/ui/registry-toolbar";
import { SelectPicker } from "@/components/ui/select-picker";
import { PesoAmountInput } from "@/components/ui/peso-amount-input";
import { deleteDemoRecord, getDemoDatabase, registerDemoEmployee, updateDemoRecord } from "@/lib/demo/database";
import { isDemoManager, type DemoData, type DemoRole } from "@/lib/demo/schema";
import { formatDemoCentavos, parseDemoProjectAmount } from "@/lib/demo/project-overview";
import { demoPhotoFromFile } from "@/lib/media/demo-photo";
import { DemoRecordActions } from "./demo-record-actions";
import { DemoRecordDetailDialog } from "./demo-record-detail-dialog";

type Employee = DemoData["employees"][number];
const inputClass = "h-10 rounded-lg border border-slate-200 px-3 text-sm";

export function DemoEmployees({ employees, users, role, action, onChanged }: { employees: Employee[]; users: DemoData["users"]; role: DemoRole; action?: string | null; onChanged: (message: string) => Promise<void> }) {
  const [busyId, setBusyId] = useState<string | null>(null);
  const [error, setError] = useState("");
  const [query, setQuery] = useState("");
  const [viewingId, setViewingId] = useState<string | null>(null);
  const [editingId, setEditingId] = useState<string | null>(null);
  const canEdit = isDemoManager(role);
  const dialog = useRef<HTMLDialogElement>(null);
  const submitLock = useRef(false);

  useEffect(() => { if (action === "add" && canEdit && !dialog.current?.open) dialog.current?.showModal(); }, [action, canEdit]);

  function close() {
    dialog.current?.close();
    setEditingId(null);
    const url = new URL(window.location.href);
    if (url.searchParams.has("action")) { url.searchParams.delete("action"); window.history.replaceState(null, "", `${url.pathname}${url.search}`); }
  }

  function openEdit(employeeId: string) {
    setError("");
    setEditingId(employeeId);
    dialog.current?.showModal();
  }

  async function saveEmployee(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (submitLock.current) return;
    submitLock.current = true; setError(""); setBusyId(editingId ?? "new");
    const data = new FormData(event.currentTarget);
    try {
      const file = data.get("photo");
      const photo = file instanceof File && file.size ? await demoPhotoFromFile(file, 400) : undefined;
      const linkedUser = String(data.get("userId") ?? "unlinked");
      const changes = { name: String(data.get("name") ?? ""), trade: String(data.get("trade") ?? ""), userId: linkedUser === "unlinked" ? undefined : linkedUser, contactNumber: String(data.get("contactNumber") ?? "").trim() || undefined, email: String(data.get("email") ?? "").trim().toLowerCase() || undefined, dailyWageCentavos: parseDemoProjectAmount(String(data.get("dailyWage") ?? ""), "Daily wage"), ...(photo ? { photo } : {}) };
      if (editingId) await updateDemoRecord(getDemoDatabase(), "employees", editingId, changes);
      else await registerDemoEmployee(getDemoDatabase(), changes);
      await onChanged(editingId ? "Employee saved." : "Employee added.");
      close();
    } catch (cause) { setError(cause instanceof Error ? cause.message : "Unable to save employee."); }
    finally { submitLock.current = false; setBusyId(null); }
  }

  async function remove(employeeId: string, name: string) {
    if (!window.confirm(`Delete ${name}? Employees with attendance history cannot be deleted.`)) return;
    setBusyId(employeeId); setError("");
    try { await deleteDemoRecord(getDemoDatabase(), "employees", employeeId); await onChanged("Employee deleted."); }
    catch (cause) { setError(cause instanceof Error ? cause.message : "Unable to delete employee."); }
    finally { setBusyId(null); }
  }

  const visible = employees.filter((employee) => `${employee.name} ${employee.trade} ${employee.contactNumber ?? ""} ${employee.email ?? ""}`.toLowerCase().includes(query.trim().toLowerCase()));
  const viewing = employees.find((employee) => employee.id === viewingId);
  const editing = employees.find((employee) => employee.id === editingId);
  const workerAccounts = users.filter((user) => user.role === "worker" && (user.id === editing?.userId || !employees.some((employee) => employee.userId === user.id)));

  return <>
    <RegistryToolbar search={<SearchField label="Search employees" value={query} onChange={(event) => setQuery(event.target.value)} placeholder="Search employees" />} actions={canEdit ? <Button onClick={() => { setEditingId(null); setError(""); dialog.current?.showModal(); }}><HugeiconsIcon icon={PlusSignIcon} size={17} />Add employee</Button> : null} />
    {error && <p role="alert" className="mt-4 rounded-lg bg-red-50 p-3 text-sm text-red-700">{error}</p>}
    <div className="mt-4"><DataTableShell empty={visible.length === 0 ? query ? <EmptyState kind="results" title="No matching employees" description="Try another search." /> : canEdit ? <EmptyState kind="items" title="No employees yet" description="Add the first employee to start the registry." /> : <EmptyState kind="items" title="No employees available" /> : undefined}>
      <table className="w-full min-w-[760px] text-left text-sm">
        <thead className="bg-slate-50 text-slate-500"><tr><th className="px-5 py-3">Employee</th><th className="px-4 py-3">Trade</th><th className="px-4 py-3">Phone</th><th className="px-4 py-3">Email</th>{canEdit && <th className="px-4 py-3 text-right">Daily wage</th>}{canEdit && <th className="px-5 py-3 text-right">Actions</th>}</tr></thead>
        <tbody className="divide-y divide-slate-100">{visible.map((employee) => <tr key={employee.id} className="hover:bg-slate-50/60">
          <td className="px-5 py-3"><button type="button" onClick={() => setViewingId(employee.id)} className="flex items-center gap-3 text-left hover:text-cyan-700"><span className="relative grid size-10 shrink-0 place-items-center overflow-hidden rounded-full bg-cyan-50 text-xs font-semibold text-cyan-700">{employee.photo ? <Image src={employee.photo} alt="" fill sizes="40px" unoptimized={employee.photo.startsWith("data:")} className="object-cover" /> : employee.name.split(/\s+/).map((part) => part[0]).slice(0, 2).join("").toUpperCase()}</span><span className="font-semibold">{employee.name}</span></button></td>
          <td className="px-4 py-3 text-slate-600">{employee.trade}</td><td className="px-4 py-3 text-slate-600">{employee.contactNumber ?? "—"}</td><td className="px-4 py-3 text-slate-600">{employee.email ?? "—"}</td>{canEdit && <td className="px-4 py-3 text-right tabular-nums text-slate-600">{employee.dailyWageCentavos === undefined ? "—" : formatDemoCentavos(employee.dailyWageCentavos)}</td>}
          {canEdit && <td className="px-5 py-3 text-right"><DemoRecordActions name={employee.name} busy={busyId !== null} onView={() => setViewingId(employee.id)} onEdit={() => openEdit(employee.id)} onDelete={() => void remove(employee.id, employee.name)} /></td>}
        </tr>)}</tbody>
      </table>
    </DataTableShell></div>
    <p className="mt-3 text-sm text-slate-500">{visible.length} employee{visible.length === 1 ? "" : "s"}</p>
    {viewing && <DemoRecordDetailDialog name={viewing.name} photo={viewing.photo} details={[{ label: "Trade", value: viewing.trade }, ...(canEdit ? [{ label: "Daily wage", value: viewing.dailyWageCentavos === undefined ? "Not set" : formatDemoCentavos(viewing.dailyWageCentavos) }] : []), { label: "Phone", value: viewing.contactNumber ?? "—" }, { label: "Email", value: viewing.email ?? "—" }, { label: "User account", value: users.find((user) => user.id === viewing.userId)?.name ?? "Not linked" }]} onClose={() => setViewingId(null)} />}
    <dialog ref={dialog} onClose={close} aria-labelledby="demo-add-employee-title" className="m-auto w-[min(100%-2rem,440px)] rounded-2xl border border-slate-200 bg-white p-6 text-[#07152d] shadow-2xl backdrop:bg-slate-950/45">
      <form key={editingId ?? "new"} onSubmit={(event) => void saveEmployee(event)} className="grid gap-4">
        <DialogHeading id="demo-add-employee-title" title={editing ? "Edit employee" : "Add employee"} onClose={close} disabled={busyId !== null} />
        <label className="grid gap-1.5 text-xs font-semibold">Name<input className={inputClass} name="name" required maxLength={160} defaultValue={editing?.name} /></label>
        <label className="grid gap-1.5 text-xs font-semibold">Trade<input className={inputClass} name="trade" required maxLength={160} defaultValue={editing?.trade} /></label>
        <PesoAmountInput name="dailyWage" label="Daily wage (optional)" defaultValue={editing?.dailyWageCentavos === undefined ? "" : (editing.dailyWageCentavos / 100).toFixed(2)} placeholder="0.00" />
        <label className="grid gap-1.5 text-xs font-semibold">Phone<input className={inputClass} name="contactNumber" type="tel" maxLength={40} required defaultValue={editing?.contactNumber} /></label>
        <label className="grid gap-1.5 text-xs font-semibold">Email (optional)<input className={inputClass} name="email" type="email" maxLength={320} defaultValue={editing?.email} /></label>
        <label className="grid gap-1.5 text-xs font-semibold">Worker account (optional)<SelectPicker key={editingId ?? "new"} name="userId" label="Worker account" defaultValue={editing?.userId ?? "unlinked"} options={[{ value: "unlinked", label: "Not linked" }, ...workerAccounts.map((user) => ({ value: user.id, label: user.name }))]} /></label>
        <RecordPhotoInput label="Employee photo (optional)" currentPhoto={editing?.photo} />
        {error && <p role="alert" className="text-sm text-red-700">{error}</p>}
        <div className="flex justify-end gap-2"><Button type="button" variant="outline" onClick={close} disabled={busyId !== null}>Cancel</Button><Button type="submit" disabled={busyId !== null}>{busyId ? "Saving…" : "Save"}</Button></div>
      </form>
    </dialog>
  </>;
}
