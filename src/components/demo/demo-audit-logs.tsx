"use client";

import { useState } from "react";

import { AuditLogTable } from "@/components/audit/audit-log-table";
import { Button } from "@/components/ui/button";
import { SelectPicker } from "@/components/ui/select-picker";
import { SearchField } from "@/components/ui/search-field";
import type { DemoData } from "@/lib/demo/schema";

const pageSize = 20;
const actions = ["all", "create", "update", "delete", "stock_in", "submit", "approve", "reject", "dispatch", "receipt", "consume", "assign"] as const;

export function DemoAuditLogs({ tables }: { tables: DemoData }) {
  const [query, setQuery] = useState("");
  const [action, setAction] = useState<string>("all");
  const [entity, setEntity] = useState("all");
  const [page, setPage] = useState(1);
  const needle = query.trim().toLowerCase();
  const entities = [...new Set((tables.auditLogs ?? []).map((row) => row.entity))].sort();
  const rows = (tables.auditLogs ?? []).filter((row) => (action === "all" || row.action === action) && (entity === "all" || row.entity === entity) && (!needle || `${row.entity} ${row.recordId} ${row.detail} ${tables.users.find((user) => user.id === row.actorId)?.name ?? ""}`.toLowerCase().includes(needle)))
    .toSorted((a, b) => b.createdAt.localeCompare(a.createdAt));
  const pageCount = Math.max(1, Math.ceil(rows.length / pageSize));
  const currentPage = Math.min(page, pageCount);
  const visible = rows.slice((currentPage - 1) * pageSize, currentPage * pageSize).map((row) => ({
    id: row.id,
    actor: tables.users.find((user) => user.id === row.actorId)?.name ?? "Unknown account",
    action: row.action,
    entity: row.entity,
    recordId: row.recordId,
    detail: row.detail,
    createdAt: row.createdAt,
  }));

  return <>
    <div className="flex flex-wrap items-center gap-3"><SearchField label="Search audit logs" value={query} onChange={(event) => { setQuery(event.target.value); setPage(1); }} placeholder="Search account, record or detail" wrapperClassName="min-w-[220px] max-w-sm flex-1" /><div className="w-44"><SelectPicker label="Audit record type" value={entity} onValueChange={(value) => { setEntity(value); setPage(1); }} options={[{ value: "all", label: "All records" }, ...entities.map((item) => ({ value: item, label: item.replaceAll(/([a-z])([A-Z])/g, "$1 $2").replaceAll("_", " ") }))]} className="rounded-full" /></div><div className="w-44"><SelectPicker label="Audit action" value={action} onValueChange={(value) => { setAction(value); setPage(1); }} options={actions.map((item) => ({ value: item, label: item === "all" ? "All actions" : item.replaceAll("_", " ") }))} className="rounded-full" /></div></div>
    <AuditLogTable rows={visible} total={rows.length} />
    {pageCount > 1 && <div className="mt-4 flex items-center justify-end gap-3"><Button size="sm" variant="outline" disabled={currentPage === 1} onClick={() => setPage(currentPage - 1)}>Previous</Button><span className="text-xs text-slate-500">Page {currentPage} of {pageCount}</span><Button size="sm" variant="outline" disabled={currentPage === pageCount} onClick={() => setPage(currentPage + 1)}>Next</Button></div>}
  </>;
}
