"use client";

import { useEffect, useRef, useState, type FormEvent } from "react";
import Image from "next/image";
import { HistoryLink } from "@/components/layout/history-link";
import { CancelCircleIcon, CheckmarkCircle02Icon, Download04Icon, ExcavatorIcon, PackageIcon, PlusSignIcon } from "@hugeicons/core-free-icons";
import { HugeiconsIcon, type IconSvgElement } from "@hugeicons/react";

import { Button } from "@/components/ui/button";
import { InventoryBalanceCard } from "@/components/inventory/inventory-balance-card";
import { MetricCard } from "@/components/ui/metric-card";
import { DataTableShell } from "@/components/ui/data-table-shell";
import { DialogHeading } from "@/components/ui/dialog-heading";
import { EmptyState } from "@/components/ui/empty-state";
import { SelectPicker } from "@/components/ui/select-picker";
import { SearchField } from "@/components/ui/search-field";
import { RegistryToolbar } from "@/components/ui/registry-toolbar";
import { RecordPhotoInput } from "@/components/ui/record-photo-input";
import { tableHeadClass } from "@/components/ui/table-sort-heading";
import { deleteDemoRecord, getDemoDatabase, recordDemoStockIn, registerDemoEquipment, registerDemoMaterial, updateDemoRecord } from "@/lib/demo/database";
import { isDemoManager, type DemoData, type DemoRole } from "@/lib/demo/schema";
import { visibleDemoEquipmentLocations, visibleDemoWarehouseIds } from "@/lib/demo/visibility";
import { downloadCsv } from "@/lib/export/csv";
import { demoPhotoFromFile } from "@/lib/media/demo-photo";
import { demoMaterialUnitOptions } from "@/lib/inventory/unit-options";
import { DemoRecordActions } from "./demo-record-actions";
import { DemoRecordDetailDialog } from "./demo-record-detail-dialog";

type Kind = "inventory" | "equipment";
type FormMode = "material" | "stock" | "equipment";

const equipmentPhotos: Record<string, string> = {
  "demo-equipment-excavator": "/demo-excavator.webp",
  "demo-equipment-mixer": "/demo-mixer.webp",
};
const inputClass = "h-10 w-full rounded-lg border border-slate-200 bg-white px-3 text-sm text-slate-800 outline-none focus-visible:ring-2 focus-visible:ring-cyan-600";

function Identity({ name, code, image, icon, onView }: { name: string; code: string; image?: string; icon: IconSvgElement; onView: () => void }) {
  return <button type="button" onClick={onView} aria-label={`View ${name}`} className="flex min-w-0 items-center gap-3 text-left hover:text-cyan-700 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-cyan-600">
    <div className="relative grid size-14 shrink-0 place-items-center overflow-hidden rounded-xl border border-slate-200 bg-slate-50 text-slate-400">
      {image ? <Image src={image} alt="" fill sizes="56px" unoptimized={image.startsWith("data:")} className="object-cover" /> : <HugeiconsIcon icon={icon} size={23} />}
    </div>
    <div className="min-w-0"><p className="truncate text-sm font-semibold text-slate-800">{name}</p>{code ? <p className="mt-0.5 text-xs text-slate-500">{code}</p> : null}</div>
  </button>;
}

function Field({ label, children }: { label: string; children: React.ReactNode }) {
  return <label className="block text-xs font-semibold text-slate-600">{label}<span className="mt-1.5 block">{children}</span></label>;
}

function AddRecordDialog({ mode, editingId, tables, warehouses, busy, error, onSubmit, onClose, dialogRef }: {
  mode: FormMode | null;
  editingId: string | null;
  tables: DemoData;
  warehouses: DemoData["warehouses"];
  busy: boolean;
  error: string;
  onSubmit: (event: FormEvent<HTMLFormElement>) => void;
  onClose: () => void;
  dialogRef: React.RefObject<HTMLDialogElement | null>;
}) {
  const material = tables.materials.find((item) => item.id === editingId);
  const equipment = tables.equipment.find((item) => item.id === editingId);
  const materialHasHistory = Boolean(material && tables.transactions.some((row) => row.materialId === material.id));
  return <dialog ref={dialogRef} onClose={onClose} aria-labelledby="demo-record-title" className="m-auto w-[min(100%-2rem,460px)] rounded-2xl border border-slate-200 bg-white p-0 text-[#07152d] shadow-2xl backdrop:bg-slate-950/45">
    <form key={`${mode}:${editingId ?? "new"}`} onSubmit={onSubmit} className="p-6 sm:p-7">
      <DialogHeading id="demo-record-title" title={editingId ? `Edit ${mode === "material" ? "material" : "equipment"}` : mode === "material" ? "Add inventory material" : mode === "stock" ? "Record stock in" : "Add equipment"} onClose={() => dialogRef.current?.close()} disabled={busy} />
      <div className="mt-5 grid gap-4">
        {mode === "material" && <>
          <Field label="SKU / material code"><input name="code" required maxLength={40} autoComplete="off" placeholder="e.g. BLK-001" defaultValue={material?.code} disabled={materialHasHistory} className={inputClass} /></Field>
          <Field label="Material name"><input name="name" required maxLength={160} autoComplete="off" placeholder="e.g. Concrete blocks" defaultValue={material?.name} className={inputClass} /></Field>
          <Field label="Unit"><SelectPicker key={editingId ?? "new-unit"} name="unit" label="Material unit" defaultValue={material?.unit} disabled={materialHasHistory} placeholder="Select unit" options={[...demoMaterialUnitOptions, ...(material && !demoMaterialUnitOptions.some((option) => option.value === material.unit) ? [{ value: material.unit, label: material.unit }] : [])]} />{materialHasHistory && <input type="hidden" name="unit" value={material?.unit ?? ""} />}</Field>
          <RecordPhotoInput label="Material photo (optional)" currentPhoto={material?.photo} />
          {editingId ? materialHasHistory ? <p className="text-xs text-slate-500">SKU and unit are locked after stock history exists.</p> : null : <><Field label="Opening quantity"><input name="quantity" type="number" required min="0" max="1000000000" step="0.001" defaultValue="0" className={inputClass} /></Field><Field label="Warehouse"><SelectPicker name="warehouseId" label="Warehouse" defaultValue={warehouses[0]?.id} options={warehouses.map((warehouse) => ({ value: warehouse.id, label: warehouse.name }))} /></Field></>}
        </>}
        {mode === "stock" && <>
          <Field label="Material"><SelectPicker name="materialId" label="Material" defaultValue={tables.materials[0]?.id} options={tables.materials.map((material) => ({ value: material.id, label: `${material.name} (${material.code})` }))} /></Field>
          <Field label="Warehouse"><SelectPicker name="warehouseId" label="Warehouse" defaultValue={warehouses[0]?.id} options={warehouses.map((warehouse) => ({ value: warehouse.id, label: warehouse.name }))} /></Field>
          <Field label="Quantity received"><input name="quantity" type="number" required min="0.001" max="1000000000" step="0.001" className={inputClass} /></Field>
        </>}
        {mode === "equipment" && <>
          <Field label="Equipment code"><input name="code" required maxLength={40} autoComplete="off" placeholder="e.g. EQ-003" defaultValue={equipment?.code} className={inputClass} /></Field>
          <Field label="SKU / model code"><input name="sku" maxLength={160} autoComplete="off" placeholder="e.g. EXC-HYD-320" defaultValue={equipment?.sku} className={inputClass} /></Field>
          <Field label="Equipment name"><input name="name" required maxLength={160} autoComplete="off" placeholder="e.g. Plate compactor" defaultValue={equipment?.name} className={inputClass} /></Field>
          <Field label="Current location"><SelectPicker key={editingId ?? "new-location"} name="location" label="Current location" defaultValue={equipment?.location ?? tables.warehouses[0]?.name ?? tables.sites[0]?.name} options={[...tables.warehouses.map((warehouse) => ({ value: warehouse.name, label: warehouse.name })), ...tables.sites.map((site) => ({ value: site.name, label: site.name }))]} /></Field>
          <Field label="Status"><SelectPicker key={editingId ?? "new-status"} name="status" label="Status" defaultValue={equipment?.status ?? "available"} options={[{ value: "available", label: "Available" }, { value: "under_maintenance", label: "Under maintenance" }]} /></Field>
        </>}
      </div>
      {error ? <p role="alert" className="mt-4 rounded-lg border border-red-200 bg-red-50 px-3 py-2 text-xs text-red-700">{error}</p> : null}
      <div className="mt-6 flex justify-end gap-2"><Button type="button" variant="outline" disabled={busy} onClick={() => dialogRef.current?.close()}>Cancel</Button><Button type="submit" disabled={busy}>{busy ? "Saving…" : editingId ? "Save" : mode === "stock" ? "Record stock in" : mode === "equipment" ? "Add equipment" : "Add material"}</Button></div>
    </form>
  </dialog>;
}

export function DemoRegistry({ kind, tables, role, userId, selectedLocationId, locationOptions = [], onLocationChange, action, onChanged }: { kind: Kind; tables: DemoData; role: DemoRole; userId: string; selectedLocationId?: string; locationOptions?: { value: string; label: string }[]; onLocationChange?: (locationId: string) => void; action?: string | null; onChanged: (message: string) => Promise<void> }) {
  const [query, setQuery] = useState("");
  const [mode, setMode] = useState<FormMode | null>(() => {
    if (action === "stock" && kind === "inventory" && (isDemoManager(role) || role === "warehouse_staff")) return "stock";
    if (action === "material" && kind === "inventory" && isDemoManager(role)) return "material";
    if (action === "equipment" && kind === "equipment" && isDemoManager(role)) return "equipment";
    return null;
  });
  const [busy, setBusy] = useState(false);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [error, setError] = useState("");
  const [exportMessage, setExportMessage] = useState("");
  const [viewing, setViewing] = useState<{ kind: "material" | "equipment"; id: string; balanceId?: string } | null>(null);
  const dialogRef = useRef<HTMLDialogElement>(null);
  const submitLock = useRef(false);

  useEffect(() => { if (mode && !dialogRef.current?.open) dialogRef.current?.showModal(); }, [mode]);

  function closeDialog() {
    setMode(null);
    setEditingId(null);
    const url = new URL(window.location.href);
    if (url.searchParams.has("action")) { url.searchParams.delete("action"); window.history.replaceState(null, "", `${url.pathname}${url.search}`); }
  }

  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!mode || submitLock.current) return;
    submitLock.current = true;
    setBusy(true);
    setError("");
    const form = new FormData(event.currentTarget);
    const value = (name: string) => String(form.get(name) ?? "");
    try {
      const db = getDemoDatabase();
      const photoFile = form.get("photo");
      const photo = mode === "material" && photoFile instanceof File && photoFile.size ? await demoPhotoFromFile(photoFile) : undefined;
      if (mode === "material" && editingId) await updateDemoRecord(db, "materials", editingId, { name: value("name"), ...(form.has("code") ? { code: value("code").toUpperCase() } : {}), ...(form.has("unit") ? { unit: value("unit") } : {}), ...(photo ? { photo } : {}) });
      else if (mode === "material") await registerDemoMaterial(db, { code: value("code"), name: value("name"), unit: value("unit"), warehouseId: value("warehouseId"), quantity: Number(value("quantity")), ...(photo ? { photo } : {}) });
      else if (mode === "stock") await recordDemoStockIn(db, { materialId: value("materialId"), warehouseId: value("warehouseId"), quantity: Number(value("quantity")), operationId: `demo-transaction-${crypto.randomUUID()}` });
      else if (editingId) await updateDemoRecord(db, "equipment", editingId, { code: value("code").toUpperCase(), sku: value("sku").trim() || undefined, name: value("name"), location: value("location"), status: value("status") });
      else await registerDemoEquipment(db, { code: value("code"), sku: value("sku").trim() || undefined, name: value("name"), location: value("location"), status: value("status") as "available" | "under_maintenance" });
      await onChanged(editingId ? `${mode === "material" ? "Material" : "Equipment"} saved.` : mode === "material" ? "Material added." : mode === "stock" ? "Stock in recorded." : "Equipment added.");
      dialogRef.current?.close();
      closeDialog();
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : "Unable to save this demo record.");
    } finally { submitLock.current = false; setBusy(false); }
  }

  const search = query.trim().toLowerCase();
  const warehouseIds = visibleDemoWarehouseIds(tables, role, userId);
  const warehouses = tables.warehouses.filter((warehouse) => warehouseIds.has(warehouse.id)).toSorted((a, b) => Number(b.id === selectedLocationId) - Number(a.id === selectedLocationId));
  const selectedWarehouse = warehouses.some((warehouse) => warehouse.id === selectedLocationId);
  const inventoryRows = [
    ...tables.balances.filter((balance) => warehouseIds.has(balance.warehouseId) && balance.warehouseId === selectedLocationId).map((balance) => {
      const warehouse = tables.warehouses.find((item) => item.id === balance.warehouseId);
      return { id: balance.id, materialId: balance.materialId, quantity: balance.quantity, locationName: warehouse?.name ?? "Unavailable warehouse", locationDetail: warehouse?.location ?? "", locationType: "Warehouse" };
    }),
    ...(isDemoManager(role) ? tables.siteBalances.filter((balance) => balance.siteId === selectedLocationId).map((balance) => {
      const site = tables.sites.find((item) => item.id === balance.siteId);
      const project = tables.projects.find((item) => item.id === site?.projectId);
      return { id: balance.id, materialId: balance.materialId, quantity: balance.quantity, locationName: site?.name ?? "Unavailable site", locationDetail: project?.name ?? "", locationType: "Project site" };
    }) : []),
  ].filter((balance) => {
    const material = tables.materials.find((item) => item.id === balance.materialId);
    return !search || `${material?.name} ${material?.code} ${balance.locationName} ${balance.locationDetail} ${balance.locationType}`.toLowerCase().includes(search);
  });
  const allowedLocations = visibleDemoEquipmentLocations(tables, role, userId);
  const equipmentRows = tables.equipment.filter((asset) => (isDemoManager(role) || allowedLocations.has(asset.location)) && (!search || `${asset.name} ${asset.code} ${asset.sku ?? ""} ${asset.location} ${asset.status}`.toLowerCase().includes(search)));
  const isInventory = kind === "inventory";
  const count = isInventory ? inventoryRows.length : equipmentRows.length;
  const viewingMaterial = viewing?.kind === "material" ? tables.materials.find((item) => item.id === viewing.id) : undefined;
  const viewingBalance = viewing?.balanceId ? inventoryRows.find((item) => item.id === viewing.balanceId) : undefined;
  const viewingEquipment = viewing?.kind === "equipment" ? tables.equipment.find((item) => item.id === viewing.id) : undefined;
  const equipmentRequestIds = new Set(tables.equipmentRequests.filter((request) => request.assetId === viewingEquipment?.id).map((request) => request.id));
  const equipmentHistory = viewingEquipment ? tables.auditLogs.filter((event) => event.entity === "equipment" && event.recordId === viewingEquipment.id || event.entity === "equipmentRequests" && equipmentRequestIds.has(event.recordId)).toSorted((a, b) => b.createdAt.localeCompare(a.createdAt)).map((event) => ({ id: event.id, label: event.action === "dispatch" ? "Checked out" : event.action === "receipt" ? "Returned" : event.action === "submit" ? "Requested" : event.action === "approve" ? "Approved" : event.action === "reject" ? "Rejected" : event.action === "create" ? "Registered" : "Updated", detail: `${event.detail} · ${tables.users.find((user) => user.id === event.actorId)?.name ?? "Authorized user"}`, date: event.createdAt })) : [];
  function openEdit(id: string, nextMode: "material" | "equipment") { setError(""); setEditingId(id); setMode(nextMode); }
  async function remove(id: string, name: string, recordKind: "materials" | "equipment") {
    if (!window.confirm(`Delete ${name}? Records with stock or request history cannot be removed.`)) return;
    setBusy(true); setError("");
    try { await deleteDemoRecord(getDemoDatabase(), recordKind, id); await onChanged(`${recordKind === "materials" ? "Material" : "Equipment"} deleted.`); }
    catch (cause) { setError(cause instanceof Error ? cause.message : `Unable to delete ${name}.`); }
    finally { setBusy(false); }
  }
  function exportRows() {
    try {
      const date = new Date().toISOString().slice(0, 10);
      if (isInventory) {
        downloadCsv(`nognog-demo-inventory-${date}.csv`, ["SKU", "Material", "Location type", "Location", "Detail", "On hand", "Unit", "Status"], inventoryRows.map((balance) => {
          const material = tables.materials.find((item) => item.id === balance.materialId);
          return [material?.code ?? "", material?.name ?? "", balance.locationType, balance.locationName, balance.locationDetail, balance.quantity, material?.unit ?? "", balance.quantity > 0 ? "In stock" : "Empty"];
        }));
      } else {
        downloadCsv(`nognog-demo-equipment-${date}.csv`, ["Equipment code", "SKU", "Equipment", "Current location", "Status"], equipmentRows.map((asset) => [asset.code, asset.sku ?? "", asset.name, asset.location, asset.status.replaceAll("_", " ")]));
      }
      setExportMessage(`${count} filtered ${count === 1 ? "record" : "records"} exported as CSV.`);
    } catch { setExportMessage("Unable to export CSV in this browser."); }
  }
  return <>
    {!isInventory && <h2 className="text-lg font-semibold tracking-tight">Equipment registry</h2>}
    {isInventory && locationOptions.length > 0 && <div className="mt-4 max-w-sm"><label className="mb-1.5 block text-xs font-semibold text-slate-600">Stock location</label><SelectPicker label="Stock location" value={selectedLocationId} onValueChange={onLocationChange} options={locationOptions} /></div>}
    {isInventory && <div className="mt-4 grid grid-cols-2 gap-3 sm:grid-cols-3"><MetricCard label="Material records" value={inventoryRows.length} icon={PackageIcon} tone="bg-violet-50 text-violet-700" /><MetricCard label="In stock" value={inventoryRows.filter((row) => row.quantity > 0).length} icon={CheckmarkCircle02Icon} tone="bg-emerald-50 text-emerald-700" /><div className="col-span-2 sm:col-span-1"><MetricCard label="Empty" value={inventoryRows.filter((row) => row.quantity <= 0).length} icon={CancelCircleIcon} tone="bg-amber-50 text-amber-700" /></div></div>}
    <RegistryToolbar className="mt-4 mb-3" search={<SearchField label={`Search ${kind}`} value={query} onChange={(event) => setQuery(event.target.value)} placeholder={isInventory ? "Search material or location" : "Search equipment or location"} />} actions={<>{!isInventory && (isDemoManager(role) || role === "project_manager" || role === "engineer") && <Button asChild variant="outline"><HistoryLink href="/demo?view=equipment-requests">Equipment handovers</HistoryLink></Button>}<Button variant="outline" disabled={count === 0} onClick={exportRows}><HugeiconsIcon icon={Download04Icon} size={17} />Export CSV</Button>{isInventory && selectedWarehouse && (isDemoManager(role) || role === "warehouse_staff") ? <Button variant="outline" onClick={() => { setError(""); setEditingId(null); setMode("stock"); }}><HugeiconsIcon icon={PlusSignIcon} size={17} />Stock in</Button> : null}{isDemoManager(role) && (!isInventory || selectedWarehouse) ? <Button onClick={() => { setError(""); setEditingId(null); setMode(isInventory ? "material" : "equipment"); }}><HugeiconsIcon icon={PlusSignIcon} size={17} />{isInventory ? "Add material" : "Add equipment"}</Button> : null}</>} />
    {isInventory ? inventoryRows.length ? <section className="grid gap-4 md:grid-cols-2 2xl:grid-cols-3" aria-label="Material stock balances">{inventoryRows.map((balance) => { const material = tables.materials.find((item) => item.id === balance.materialId); return <InventoryBalanceCard key={balance.id} name={material?.name ?? "Unavailable material"} sku={material?.code ?? "—"} photo={material?.photo} unit={material?.unit ?? ""} location={balance.locationName} locationDetail={balance.locationDetail} onHand={balance.quantity} reserved={0} available={balance.quantity} onView={() => setViewing({ kind: "material", id: balance.materialId, balanceId: balance.id })} actions={isDemoManager(role) && material ? <DemoRecordActions name={material.name} busy={busy} onView={() => setViewing({ kind: "material", id: material.id, balanceId: balance.id })} onEdit={() => openEdit(material.id, "material")} onDelete={() => void remove(material.id, material.name, "materials")} /> : undefined} />; })}</section> : <section className="rounded-xl border border-slate-200 bg-white"><EmptyState kind={search ? "results" : "items"} title={search ? "No matching records" : selectedWarehouse ? "No stock balances yet" : "No site stock yet"} description={search ? "Try another search." : selectedWarehouse ? "Add a material or record stock in to start tracking this warehouse." : "Receive a dispatched material request to add stock at this site."} /></section> : <DataTableShell empty={count === 0 ? search || !isDemoManager(role) ? <EmptyState kind={search ? "results" : "items"} title={search ? "No matching records" : "No accessible records yet"} description={search ? "Try another search." : undefined} /> : <EmptyState kind="items" title="No equipment yet" description="Register the first equipment item to start the registry." /> : undefined} footer={exportMessage ? <p role="status" className="text-xs text-slate-500">{exportMessage}</p> : undefined}><table className="w-full min-w-[760px] text-left text-sm"><thead className={tableHeadClass}><tr><th scope="col" className="px-5 py-3">Code</th><th scope="col" className="px-5 py-3">Equipment</th><th scope="col" className="px-5 py-3">SKU</th><th scope="col" className="px-5 py-3">Current location</th><th scope="col" className="px-5 py-3 text-right">Status</th>{isDemoManager(role) && <th scope="col" className="px-5 py-3 text-right">Actions</th>}</tr></thead><tbody className="divide-y divide-slate-100">{equipmentRows.map((asset) => <tr key={asset.id} className="hover:bg-slate-50/60"><td className="px-5 py-3 font-medium text-slate-600">{asset.code}</td><td className="px-5 py-3"><Identity name={asset.name} code="" image={equipmentPhotos[asset.id]} icon={ExcavatorIcon} onView={() => setViewing({ kind: "equipment", id: asset.id })} /></td><td className="px-5 py-3 font-medium text-slate-600">{asset.sku ?? "—"}</td><td className="px-5 py-3 text-slate-600">{asset.location}</td><td className="px-5 py-3 text-right"><span className={`inline-flex rounded-full px-2.5 py-1 text-xs font-semibold ${asset.status === "available" ? "bg-emerald-50 text-emerald-700" : asset.status === "assigned" ? "bg-blue-50 text-blue-700" : "bg-amber-50 text-amber-700"}`}>{asset.status === "available" ? "Available" : asset.status === "assigned" ? "Checked out" : "Under maintenance"}</span></td>{isDemoManager(role) && <td className="px-5 py-3 text-right"><DemoRecordActions name={asset.name} busy={busy} onView={() => setViewing({ kind: "equipment", id: asset.id })} onEdit={asset.status === "assigned" ? undefined : () => openEdit(asset.id, "equipment")} onDelete={asset.status === "assigned" ? undefined : () => void remove(asset.id, asset.name, "equipment")} /></td>}</tr>)}</tbody></table></DataTableShell>}
    {isInventory && exportMessage && <p role="status" className="mt-2 text-xs text-slate-500">{exportMessage}</p>}
    <p className="mt-3 text-sm text-slate-500">{count} {count === 1 ? "record" : "records"}</p>
    {viewingMaterial && <DemoRecordDetailDialog name={viewingMaterial.name} photo={viewingMaterial.photo} onClose={() => setViewing(null)} details={[{ label: "SKU", value: viewingMaterial.code }, { label: "Unit", value: viewingMaterial.unit }, { label: "Location", value: viewingBalance?.locationName ?? "—" }, { label: "On hand", value: `${viewingBalance?.quantity ?? 0} ${viewingMaterial.unit}` }]} />}
    {viewingEquipment && <DemoRecordDetailDialog name={viewingEquipment.name} photo={equipmentPhotos[viewingEquipment.id]} history={equipmentHistory} onClose={() => setViewing(null)} details={[{ label: "Code", value: viewingEquipment.code }, { label: "SKU", value: viewingEquipment.sku ?? "—" }, { label: "Location", value: viewingEquipment.location }, { label: "Status", value: viewingEquipment.status.replaceAll("_", " ") }]} />}
    <AddRecordDialog mode={mode} editingId={editingId} tables={tables} warehouses={warehouses} busy={busy} error={error} onSubmit={(event) => void submit(event)} onClose={closeDialog} dialogRef={dialogRef} />
  </>;
}
