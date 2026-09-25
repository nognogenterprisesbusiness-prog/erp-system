"use client";

import { useEffect, useRef, useState, type FormEvent } from "react";
import Image from "next/image";
import { PlusSignIcon, WarehouseIcon } from "@hugeicons/core-free-icons";
import { HugeiconsIcon } from "@hugeicons/react";

import { Button } from "@/components/ui/button";
import { DialogHeading } from "@/components/ui/dialog-heading";
import { LocationPicker } from "@/components/ui/location-picker";
import { RecordPhotoInput } from "@/components/ui/record-photo-input";
import { EmptyState } from "@/components/ui/empty-state";
import { deleteDemoRecord, getDemoDatabase, registerDemoWarehouse, updateDemoRecord } from "@/lib/demo/database";
import { isDemoManager, type DemoData, type DemoRole } from "@/lib/demo/schema";
import { visibleDemoWarehouseIds } from "@/lib/demo/visibility";
import { demoPhotoFromFile } from "@/lib/media/demo-photo";
import { DemoRecordActions } from "./demo-record-actions";
import { RecordActionIcon } from "@/components/ui/record-action-menu";
import { DemoRecordDetailDialog } from "./demo-record-detail-dialog";

export function DemoWarehouses({ tables, role, userId, action, onChanged }: { tables: DemoData; role: DemoRole; userId: string; action?: string | null; onChanged: (message: string) => Promise<void> }) {
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const [editingId, setEditingId] = useState<string | null>(null);
  const [viewingId, setViewingId] = useState<string | null>(null);
  const [formKey, setFormKey] = useState(0);
  const dialog = useRef<HTMLDialogElement>(null);
  const lock = useRef(false);
  const canAdd = isDemoManager(role);
  useEffect(() => { if (action === "add" && canAdd && !dialog.current?.open) { setEditingId(null); dialog.current?.showModal(); } }, [action, canAdd]);

  function openEdit(id: string) { setEditingId(id); setFormKey((value) => value + 1); dialog.current?.showModal(); }

  function close() {
    dialog.current?.close();
    setError("");
    setEditingId(null);
    setFormKey((value) => value + 1);
    const url = new URL(window.location.href);
    if (url.searchParams.has("action")) { url.searchParams.delete("action"); window.history.replaceState(null, "", `${url.pathname}${url.search}`); }
  }

  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (lock.current) return;
    lock.current = true;
    setBusy(true); setError("");
    const form = new FormData(event.currentTarget);
    try {
      const photo = form.get("photo");
      const municipalityCode = String(form.get("municipalityCode") ?? "");
      if (!/^\d{10}$/.test(municipalityCode)) throw new Error("Choose a city or municipality from the list.");
      const changes = { name: String(form.get("name") ?? ""), location: String(form.get("location") ?? ""), municipalityCode, address: String(form.get("address") ?? ""), ...(photo instanceof File && photo.size ? { photo: await demoPhotoFromFile(photo) } : {}) };
      if (editingId) await updateDemoRecord(getDemoDatabase(), "warehouses", editingId, changes);
      else await registerDemoWarehouse(getDemoDatabase(), changes);
      await onChanged(editingId ? "Warehouse saved." : "Warehouse added.");
      close();
    } catch (cause) { setError(cause instanceof Error ? cause.message : "Unable to add warehouse."); }
    finally { lock.current = false; setBusy(false); }
  }

  async function remove(id: string, name: string) {
    if (!window.confirm(`Delete ${name}? Warehouses with stock, assignments or history cannot be removed.`)) return;
    setBusy(true); setError("");
    try { await deleteDemoRecord(getDemoDatabase(), "warehouses", id); await onChanged("Warehouse deleted."); }
    catch (cause) { setError(cause instanceof Error ? cause.message : "Unable to delete warehouse."); }
    finally { setBusy(false); }
  }

  const warehouseIds = visibleDemoWarehouseIds(tables, role, userId);
  const warehouses = tables.warehouses.filter((warehouse) => warehouseIds.has(warehouse.id));
  const viewing = warehouses.find((warehouse) => warehouse.id === viewingId);
  return <>
    <div className="mb-5 flex justify-end">{canAdd ? <Button className="rounded-full px-5" onClick={() => { setEditingId(null); dialog.current?.showModal(); }}><HugeiconsIcon icon={PlusSignIcon} size={17} />Add warehouse</Button> : null}</div>
    {error ? <p role="alert" className="mb-4 rounded-lg bg-red-50 p-3 text-sm text-red-700">{error}</p> : null}
    {warehouses.length ? <section aria-label="Warehouses" className="grid gap-4 md:grid-cols-2 xl:grid-cols-3">{warehouses.map((warehouse) => <article key={warehouse.id} className="flex min-w-0 flex-col rounded-2xl border border-slate-200 bg-white p-5 shadow-[0_1px_2px_rgba(15,23,42,0.03)]"><div className="flex min-w-0 items-center gap-3"><button type="button" onClick={() => setViewingId(warehouse.id)} aria-label={`View ${warehouse.name}`} className="relative grid size-14 shrink-0 place-items-center overflow-hidden rounded-xl bg-slate-100 text-slate-400 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-cyan-600">{warehouse.photo ? <Image src={warehouse.photo} alt="" fill sizes="56px" unoptimized={warehouse.photo.startsWith("data:")} className="object-cover" /> : <HugeiconsIcon icon={WarehouseIcon} size={23} />}</button><div className="min-w-0"><button type="button" onClick={() => setViewingId(warehouse.id)} className="block max-w-full truncate text-left text-base font-semibold text-slate-900 hover:text-cyan-700">{warehouse.name}</button><p className="mt-0.5 truncate text-xs text-slate-500">{warehouse.location}</p></div></div><div className="mt-5 rounded-xl bg-slate-50 p-4"><p className="text-xs text-slate-500">Materials tracked</p><p className="mt-1 text-2xl font-semibold tabular-nums text-slate-900">{tables.balances.filter((balance) => balance.warehouseId === warehouse.id).length}</p></div>{warehouse.address && warehouse.address !== warehouse.location ? <p className="mt-4 truncate text-sm text-slate-600" title={warehouse.address}>{warehouse.address}</p> : null}<div className="mt-auto flex justify-end pt-3">{canAdd ? <DemoRecordActions name={warehouse.name} busy={busy} onView={() => setViewingId(warehouse.id)} onEdit={() => openEdit(warehouse.id)} onDelete={() => void remove(warehouse.id, warehouse.name)} /> : <RecordActionIcon label="View" name={warehouse.name} onSelect={() => setViewingId(warehouse.id)} />}</div></article>)}</section> : <section className="rounded-2xl border border-slate-200 bg-white"><EmptyState kind="items" title="No accessible warehouses" description="Ask an administrator for warehouse access." /></section>}
    {viewing && <DemoRecordDetailDialog name={viewing.name} photo={viewing.photo} onClose={() => setViewingId(null)} details={[{ label: "City", value: viewing.location }, { label: "Address", value: viewing.address || viewing.location }, { label: "Materials tracked", value: tables.balances.filter((balance) => balance.warehouseId === viewing.id).length }, { label: "Stock", value: tables.balances.filter((balance) => balance.warehouseId === viewing.id).map((balance) => { const material = tables.materials.find((item) => item.id === balance.materialId); return `${material?.name ?? "Material"}: ${balance.quantity.toLocaleString()} ${material?.unit ?? ""}`; }).join(" · ") || "No stock recorded" }, { label: "Stock movements", value: tables.transactions.filter((transaction) => transaction.warehouseId === viewing.id).length }, { label: "Assigned staff", value: tables.warehouseMemberships.filter((member) => member.warehouseId === viewing.id).map((member) => tables.users.find((user) => user.id === member.userId)?.name).filter(Boolean).join(", ") || "None assigned" }]} />}
    <dialog ref={dialog} onClose={close} aria-labelledby="demo-warehouse-title" className="m-auto w-[min(100%-2rem,440px)] rounded-2xl border border-slate-200 bg-white p-6 text-[#07152d] shadow-2xl backdrop:bg-slate-950/45"><form key={`${formKey}:${editingId ?? "new"}`} onSubmit={(event) => void submit(event)} className="grid gap-4"><DialogHeading id="demo-warehouse-title" title={editingId ? "Edit warehouse" : "Add warehouse"} onClose={close} disabled={busy} /><label className="grid gap-1.5 text-xs font-semibold text-slate-600">Warehouse name<input name="name" required maxLength={160} defaultValue={tables.warehouses.find((item) => item.id === editingId)?.name} className="h-10 rounded-lg border border-slate-200 px-3 text-sm font-normal" /></label><LocationPicker demo displayNameName="location" initialCode={tables.warehouses.find((item) => item.id === editingId)?.municipalityCode ?? ""} initialLabel={tables.warehouses.find((item) => item.id === editingId)?.location ?? ""} /><label className="grid gap-1.5 text-xs font-semibold text-slate-600">Street address<input name="address" maxLength={300} defaultValue={tables.warehouses.find((item) => item.id === editingId)?.address} className="h-10 rounded-lg border border-slate-200 px-3 text-sm font-normal" /></label><RecordPhotoInput label="Warehouse photo (optional)" currentPhoto={tables.warehouses.find((item) => item.id === editingId)?.photo} />{error ? <p role="alert" className="text-sm text-red-700">{error}</p> : null}<div className="flex justify-end gap-2"><Button type="button" variant="outline" onClick={close} disabled={busy}>Cancel</Button><Button type="submit" disabled={busy}>{busy ? "Saving…" : "Save"}</Button></div></form></dialog>
  </>;
}
