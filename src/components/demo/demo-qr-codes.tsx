"use client";

import { useEffect, useRef, useState } from "react";
import Image from "next/image";
import QRCode from "qrcode";
import { PrinterIcon, ViewIcon } from "@hugeicons/core-free-icons";
import { HugeiconsIcon } from "@hugeicons/react";

import { Button } from "@/components/ui/button";
import { DataTableShell } from "@/components/ui/data-table-shell";
import { DialogHeading } from "@/components/ui/dialog-heading";
import { EmptyState } from "@/components/ui/empty-state";
import { SelectPicker } from "@/components/ui/select-picker";
import { SearchField } from "@/components/ui/search-field";
import type { DemoData } from "@/lib/demo/schema";

type EntityType = DemoData["qrCodes"][number]["entityType"];
const types: { value: EntityType; label: string }[] = [
  { value: "material", label: "Material" }, { value: "equipment", label: "Equipment" },
  { value: "warehouse", label: "Warehouse" }, { value: "project_site", label: "Project site" },
];

export function DemoQrCodes({ tables }: { tables: DemoData }) {
  const [type, setType] = useState<EntityType | "all">("all");
  const [query, setQuery] = useState("");
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [image, setImage] = useState("");
  const [printAfterLoad, setPrintAfterLoad] = useState(false);
  const [page, setPage] = useState(1);
  const dialog = useRef<HTMLDialogElement>(null);
  const needle = query.trim().toLowerCase();
  const targetFor = (code: DemoData["qrCodes"][number]) => code.entityType === "material" ? tables.materials.find((row) => row.id === code.entityId) : code.entityType === "equipment" ? tables.equipment.find((row) => row.id === code.entityId) : code.entityType === "warehouse" ? tables.warehouses.find((row) => row.id === code.entityId) : tables.sites.find((row) => row.id === code.entityId);
  const codes = tables.qrCodes.filter((code) => (type === "all" || code.entityType === type) && (!needle || `${code.identifier} ${code.entityType} ${targetFor(code)?.name ?? ""}`.toLowerCase().includes(needle))).toSorted((a, b) => b.createdAt.localeCompare(a.createdAt));
  const pageSize = 10;
  const pageCount = Math.max(1, Math.ceil(codes.length / pageSize));
  const currentPage = Math.min(page, pageCount);
  const selected = codes.find((row) => row.id === selectedId);
  const target = selected ? targetFor(selected) : undefined;
  const targetName = target?.name ?? "Unavailable record";

  useEffect(() => {
    if (!selected) return;
    let active = true;
    queueMicrotask(() => { if (active) setImage(""); });
    void QRCode.toDataURL(selected.identifier, { width: 280, margin: 2, errorCorrectionLevel: "M" }).then((url) => { if (active) setImage(url); }).catch(() => { if (active) setImage(""); });
    return () => { active = false; };
  }, [selected]);

  useEffect(() => {
    if (selected && !dialog.current?.open) dialog.current?.showModal();
  }, [selected]);

  useEffect(() => {
    if (!image || !printAfterLoad) return;
    const frame = requestAnimationFrame(() => { setPrintAfterLoad(false); window.print(); });
    return () => cancelAnimationFrame(frame);
  }, [image, printAfterLoad]);

  function close() { dialog.current?.close(); setSelectedId(null); setPrintAfterLoad(false); }

  return <>
    <div className="flex flex-wrap items-center gap-3">
      <SearchField label="Search QR labels" value={query} onChange={(event) => { setQuery(event.target.value); setPage(1); }} placeholder="Search identifier or record" wrapperClassName="min-w-[220px] max-w-sm flex-1" />
      <div className="w-44"><SelectPicker label="QR record type" value={type} onValueChange={(value) => { setType(value as EntityType | "all"); setPage(1); }} options={[{ value: "all", label: "All records" }, ...types]} className="rounded-full" /></div>
    </div>
    <div className="mt-5"><DataTableShell empty={codes.length ? undefined : <EmptyState kind={query || type !== "all" ? "results" : "items"} title={query || type !== "all" ? "No matching QR labels" : "No QR labels yet"} description={query || type !== "all" ? "Try another search or record type." : "Generate a label from a material, asset, warehouse, or project site."} /> }>
      <table className="w-full min-w-[720px] text-left text-sm"><thead className="bg-slate-50 text-xs font-semibold text-slate-500"><tr><th className="px-5 py-3">Identifier</th><th className="px-4 py-3">Record</th><th className="px-4 py-3">Type</th><th className="px-4 py-3">Generated</th><th className="px-5 py-3 text-right">Actions</th></tr></thead><tbody className="divide-y divide-slate-100">{codes.slice((currentPage - 1) * pageSize, currentPage * pageSize).map((code) => <tr key={code.id}><td className="px-5 py-3 font-mono text-xs text-slate-700">{code.identifier}</td><td className="px-4 py-3 font-medium text-slate-800">{targetFor(code)?.name ?? "Unavailable record"}</td><td className="px-4 py-3 text-slate-600">{types.find((item) => item.value === code.entityType)?.label}</td><td className="px-4 py-3 text-slate-500">{new Date(code.createdAt).toLocaleDateString("en-PH")}</td><td className="px-5 py-3 text-right"><div className="flex justify-end gap-1"><button type="button" onClick={() => { setImage(""); setSelectedId(code.id); }} aria-label={`View QR label for ${targetFor(code)?.name ?? code.identifier}`} title="View QR label" className="grid size-9 place-items-center rounded-full text-slate-600 hover:bg-slate-100 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-cyan-600"><HugeiconsIcon icon={ViewIcon} size={18} /></button><button type="button" onClick={() => { setImage(""); setSelectedId(code.id); setPrintAfterLoad(true); }} aria-label={`Print QR label for ${targetFor(code)?.name ?? code.identifier}`} title="Print QR label" className="grid size-9 place-items-center rounded-full text-slate-600 hover:bg-slate-100 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-cyan-600"><HugeiconsIcon icon={PrinterIcon} size={18} /></button></div></td></tr>)}</tbody></table>
    </DataTableShell><div className="mt-3 flex items-center justify-between gap-3"><p className="text-sm text-slate-500">{codes.length} label{codes.length === 1 ? "" : "s"}</p>{pageCount > 1 && <div className="flex items-center gap-2"><Button size="sm" variant="outline" disabled={currentPage === 1} onClick={() => setPage(currentPage - 1)}>Previous</Button><span className="text-xs text-slate-500">Page {currentPage} of {pageCount}</span><Button size="sm" variant="outline" disabled={currentPage === pageCount} onClick={() => setPage(currentPage + 1)}>Next</Button></div>}</div></div>
    <dialog ref={dialog} onClose={close} aria-labelledby="demo-qr-title" className="m-auto w-[min(100%-2rem,420px)] rounded-2xl border border-slate-200 bg-white p-6 text-[#07152d] shadow-2xl backdrop:bg-slate-950/45">{selected && <><DialogHeading id="demo-qr-title" title={targetName} onClose={close} /><p className="mt-2 break-all font-mono text-xs text-slate-500">{selected.identifier}</p><div className="mt-5 flex min-h-56 items-center justify-center rounded-xl border border-slate-200 bg-white p-4">{image ? <Image src={image} alt={`QR code ${selected.identifier}`} width={220} height={220} unoptimized /> : <span role="status" className="text-sm text-slate-500">Generating label…</span>}</div><div className="mt-5 flex justify-end gap-2"><Button variant="outline" onClick={close}>Close</Button><Button onClick={() => window.print()} disabled={!image}><HugeiconsIcon icon={PrinterIcon} size={17} />Print label</Button></div></>}</dialog>
    {selected && image && <div className="demo-qr-print hidden"><div className="mx-auto max-w-sm rounded-xl border-2 border-slate-900 p-6 text-center"><p className="text-sm font-bold tracking-widest">NOGNOG ENTERPRISES</p><p className="mt-2 text-xs uppercase">{types.find((item) => item.value === selected.entityType)?.label}</p><Image src={image} alt="" width={280} height={280} unoptimized className="mx-auto my-4" /><p className="font-semibold">{targetName}</p><p className="mt-2 break-all font-mono text-xs">{selected.identifier}</p></div></div>}
  </>;
}
