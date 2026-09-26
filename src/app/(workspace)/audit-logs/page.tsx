import { ListFilterBar } from "@/components/ui/list-filter-bar";
import Link from "next/link";
import { notFound } from "next/navigation";

import { AuditLogTable } from "@/components/audit/audit-log-table";
import { Button } from "@/components/ui/button";
import { PageHeader } from "@/components/ui/page-header";
import { SelectPicker } from "@/components/ui/select-picker";
import { SearchField } from "@/components/ui/search-field";
import { requireUser } from "@/lib/auth";
import { safeSearchTerm } from "@/lib/data/search";
import { createClient } from "@/lib/supabase/server";

const pageSize = 25;
const actions = ["all", "insert", "update", "delete"] as const;
const entities = ["all", "materials", "inventory_transactions", "inventory_transfers", "warehouses", "projects", "project_sites", "employees", "assets", "daily_reports", "material_requests", "qr_codes", "profiles", "user_roles"] as const;

export default async function AuditLogsPage({ searchParams }: { searchParams: Promise<Record<string, string | string[] | undefined>> }) {
  const { q, action: requestedAction, entity: requestedEntity, page: requestedPage } = await searchParams;
  const user = await requireUser();
  if (!user.canManage) notFound();
  const query = safeSearchTerm(typeof q === "string" ? q : "");
  const action = typeof requestedAction === "string" && actions.includes(requestedAction as typeof actions[number]) ? requestedAction as typeof actions[number] : "all";
  const entity = typeof requestedEntity === "string" && entities.includes(requestedEntity as typeof entities[number]) ? requestedEntity as typeof entities[number] : "all";
  const parsedPage = typeof requestedPage === "string" ? Number.parseInt(requestedPage, 10) : 1;
  const page = Number.isSafeInteger(parsedPage) ? Math.min(10000, Math.max(1, parsedPage)) : 1;
  const supabase = await createClient();
  let request = supabase.from("audit_logs").select("id,actor_id,table_name,record_id,action,created_at", { count: "exact" }).order("created_at", { ascending: false }).order("id", { ascending: false }).range((page - 1) * pageSize, page * pageSize - 1);
  if (action !== "all") request = request.eq("action", action);
  if (entity !== "all") request = request.eq("table_name", entity);
  if (query) request = request.ilike("table_name", `%${query}%`);
  const { data: logs, count, error } = await request;
  if (error) throw new Error("Unable to load audit logs.");
  const actorIds = [...new Set((logs ?? []).flatMap((entry) => entry.actor_id ? [entry.actor_id] : []))];
  const actorNames = new Map<string, string>();
  const actorPhotos = new Map<string, string>();
  if (actorIds.length) {
    const { data: profiles, error: profileError } = await supabase.from("profiles").select("id,full_name,avatar_path").in("id", actorIds);
    if (profileError) throw new Error("Unable to load audit actors.");
    for (const profile of profiles ?? []) {
      actorNames.set(profile.id, profile.full_name);
      if (profile.avatar_path) actorPhotos.set(profile.id, `/profile/avatar?userId=${profile.id}`);
    }
  }
  const rows = (logs ?? []).map((entry) => ({ id: String(entry.id), actor: entry.actor_id ? actorNames.get(entry.actor_id) ?? "Former account" : "System", actorPhoto: entry.actor_id ? actorPhotos.get(entry.actor_id) : undefined, action: entry.action, entity: entry.table_name, recordId: entry.record_id ?? "—", detail: `${entry.action} in ${entry.table_name.replaceAll("_", " ")}`, createdAt: entry.created_at }));
  const total = count ?? 0;
  const pageCount = Math.max(1, Math.ceil(total / pageSize));
  const href = (target: number) => { const params = new URLSearchParams(); if (query) params.set("q", query); if (action !== "all") params.set("action", action); if (entity !== "all") params.set("entity", entity); if (target > 1) params.set("page", String(target)); return `/audit-logs?${params}`; };

  return <>
    <PageHeader eyebrow="Account oversight" title="Audit logs" description="Recorded changes to connected ERP records." />
    <ListFilterBar className="mt-6 flex flex-wrap items-center gap-3"><SearchField name="q" label="Search audited entity" defaultValue={query} maxLength={80} placeholder="Search record type" wrapperClassName="min-w-[210px] max-w-sm flex-1" /><div className="w-44"><SelectPicker name="entity" label="Audit record type" defaultValue={entity} options={entities.map((item) => ({ value: item, label: item === "all" ? "All records" : item.replaceAll("_", " ") }))} className="rounded-full" /></div><div className="w-44"><SelectPicker name="action" label="Audit action" defaultValue={action} options={actions.map((item) => ({ value: item, label: item === "all" ? "All actions" : item }))} className="rounded-full" /></div></ListFilterBar>
    <AuditLogTable rows={rows} total={total} />
    {pageCount > 1 && <nav aria-label="Audit log pages" className="mt-4 flex items-center justify-end gap-3">{page > 1 ? <Button size="sm" variant="outline" asChild><Link href={href(page - 1)}>Previous</Link></Button> : <Button size="sm" variant="outline" disabled>Previous</Button>}<span className="text-xs text-slate-500">Page {page} of {pageCount}</span>{page < pageCount ? <Button size="sm" variant="outline" asChild><Link href={href(page + 1)}>Next</Link></Button> : <Button size="sm" variant="outline" disabled>Next</Button>}</nav>}
  </>;
}
