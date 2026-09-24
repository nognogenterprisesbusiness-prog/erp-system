"use client";

import { useEffect, useState } from "react";
import Image from "next/image";
import QRCode from "qrcode";
import { PrinterIcon } from "@hugeicons/core-free-icons";
import { HugeiconsIcon } from "@hugeicons/react";

import { Button } from "@/components/ui/button";
import { DataTableShell } from "@/components/ui/data-table-shell";
import { EmptyState } from "@/components/ui/empty-state";
import { SelectPicker } from "@/components/ui/select-picker";
import { SearchField } from "@/components/ui/search-field";
import type { DemoData } from "@/lib/demo/schema";

type EntityType = DemoData["qrCodes"][number]["entityType"];
const types: { value: EntityType; label: string }[] = [
  { value: "material", label: "Material" }, { value: "equipment", label: "Equipment" },
  { value: "warehouse", label: "Warehouse" }, { value: "project_site", label: "Project site" },
];

export function DemoQrCodes({ tables }: { tables: DemoData; onChanged: (message: string) => Promise<void> }) {
  const [type, setType] = useState<EntityType | "all">("all");
  const [query, setQuery] = useState("");
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [image, setImage] = useState("");
  const [page, setPage] = useState(1);
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

  return <>
    <div className="flex flex-wrap items-center gap-3">
      <SearchField label="Search QR labels" value={query} onChange={(event) => { setQuery(event.target.value); setPage(1); }} placeholder="Search identifier or record" wrapperClassName="min-w-[220px] max-w-sm flex-1" />
      <div className="w-44"><SelectPicker label="QR record type" value={type} onValueChange={(value) => { setType(value as EntityType | "all"); setPage(1); }} options={[{ value: "all", label: "All records" }, ...types]} className="rounded-full" /></div>
    </div>
    <div className="mt-5"><DataTableShell empty={codes.length ? undefined : <EmptyState kind={query || type !== "all" ? "results" : "items"} title={query || type !== "all" ? "No matching QR labels" : "No QR labels yet"} description={query || type !== "all" ? "Try another search or record type." : "Generate a label from a material, asset, warehouse, or project site."} /> }>
      <table className="w-full min-w-[720px] text-left text-sm"><thead className="bg-slate-50 text-xs font-semibold text-slate-500"><tr><th className="px-5 py-3">Identifier</th><th className="px-4 py-3">Record</th><th className="px-4 py-3">Type</th><th className="px-4 py-3">Generated</th><th className="px-5 py-3 text-right">Action</th></tr></thead><tbody className="divide-y divide-slate-100">{codes.slice((currentPage - 1) * pageSize, currentPage * pageSize).map((code) => <tr key={code.id}><td className="px-5 py-3 font-mono text-xs text-slate-700">{code.identifier}</td><td className="px-4 py-3 font-medium text-slate-800">{targetFor(code)?.name ?? "Unavailable record"}</td><td className="px-4 py-3 text-slate-600">{types.find((item) => item.value === code.entityType)?.label}</td><td className="px-4 py-3 text-slate-500">{new Date(code.createdAt).toLocaleDateString("en-PH")}</td><td className="px-5 py-3 text-right"><button type="button" onClick={() => setSelectedId(code.id)} className="font-semibold text-cyan-700 hover:underline">View / print</button></td></tr>)}</tbody></table>
    </DataTableShell><div className="mt-3 flex items-center justify-between gap-3"><p className="text-sm text-slate-500">{codes.length} label{codes.length === 1 ? "" : "s"}</p>{pageCount > 1 && <div className="flex items-center gap-2"><Button size="sm" variant="outline" disabled={currentPage === 1} onClick={() => setPage(currentPage - 1)}>Previous</Button><span className="text-xs text-slate-500">Page {currentPage} of {pageCount}</span><Button size="sm" variant="outline" disabled={currentPage === pageCount} onClick={() => setPage(currentPage + 1)}>Next</Button></div>}</div></div>
    {selected && <div className="mt-5 rounded-2xl border border-slate-200 bg-white p-5"><div className="flex items-center justify-between gap-3"><div><h2 className="font-semibold text-slate-800">{targetName}</h2><p className="mt-1 text-xs text-slate-500">{selected.identifier}</p></div><Button variant="outline" onClick={() => window.print()} disabled={!image}><HugeiconsIcon icon={PrinterIcon} size={17} />Print label</Button></div>{image && <div className="mt-4 flex justify-center"><Image src={image} alt={`QR code ${selected.identifier}`} width={220} height={220} unoptimized /></div>}</div>}
    {selected && image && <div className="demo-qr-print hidden"><div className="mx-auto max-w-sm rounded-xl border-2 border-slate-900 p-6 text-center"><p className="text-sm font-bold tracking-widest">NOGNOG ENTERPRISES</p><p className="mt-2 text-xs uppercase">{types.find((item) => item.value === selected.entityType)?.label}</p><Image src={image} alt="" width={280} height={280} unoptimized className="mx-auto my-4" /><p className="font-semibold">{targetName}</p><p className="mt-2 break-all font-mono text-xs">{selected.identifier}</p></div></div>}
  </>;
}
