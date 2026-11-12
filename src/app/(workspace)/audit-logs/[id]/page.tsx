import { IntentLink as Link } from "@/components/layout/intent-link";
import { notFound } from "next/navigation";
import { Button } from "@/components/ui/button";
import { DataTableShell } from "@/components/ui/data-table-shell";
import { EmptyState } from "@/components/ui/empty-state";
import { PageHeader } from "@/components/ui/page-header";
import { requireUser } from "@/lib/auth";
import { auditChanges, auditRecordName, auditRecordLabel, auditActionLabel, auditSummary } from "@/lib/audit/presentation";
import { getAuditReferenceNames } from "@/lib/audit/reference-names";
import { createClient } from "@/lib/supabase/server";

export default async function AuditLogDetailPage({ params }: { params: Promise<{ id: string }> }) {
  if (!(await requireUser()).canManage) notFound();
  const { id } = await params;
  if (!/^[1-9]\d{0,18}$/.test(id)) notFound();
  const supabase = await createClient();
  const { data: log, error } = await supabase.from("audit_logs")
    .select("id,actor_id,table_name,record_id,action,old_data,new_data,created_at")
    .filter("id", "eq", id).maybeSingle();
  if (error) throw new Error(`Unable to load audit record: ${error.message}`, { cause: error });
  if (!log) notFound();
  const actor = log.actor_id ? await supabase.from("profiles").select("full_name").eq("id", log.actor_id).maybeSingle() : null;
  if (actor?.error) throw new Error("Unable to load the account that made this change.");
  const names = await getAuditReferenceNames(log.old_data, log.new_data);
  const changes = auditChanges(log.old_data, log.new_data, names);
  const visible = changes.filter(change => !change.technical);
  const technical = changes.filter(change => change.technical);
  const action = auditActionLabel(log.action);
  const recordName = auditRecordName(log.table_name, log.old_data, log.new_data);
  const changeList = (rows: typeof changes) => <div className="divide-y divide-slate-100">{rows.map(change => <section key={change.field} aria-label={change.label} className="grid gap-3 px-5 py-4 md:grid-cols-[minmax(120px,1fr)_minmax(0,3fr)]">
    <h3 className="break-words text-sm font-semibold text-slate-800">{change.label}</h3>
    <dl className={`grid min-w-0 gap-4 text-sm ${log.action === "update" ? "sm:grid-cols-2" : ""}`}>{log.action !== "insert" && <div className="min-w-0"><dt className="mb-1 text-xs text-slate-500">Previous value</dt><dd className="whitespace-pre-wrap break-words leading-6 text-slate-600 [overflow-wrap:anywhere]">{change.before}</dd></div>}{log.action !== "delete" && <div className="min-w-0"><dt className="mb-1 text-xs text-slate-500">New value</dt><dd className="whitespace-pre-wrap break-words font-medium leading-6 text-slate-900 [overflow-wrap:anywhere]">{change.after}</dd></div>}</dl>
  </section>)}</div>;
  return <>
    <PageHeader title={`${action}: ${recordName}`} description={auditRecordLabel(log.table_name)}
      action={<Button asChild variant="outline"><Link data-detail-back href="/audit-logs">Back to audit history</Link></Button>} />
    <div className="mt-5 rounded-xl border border-slate-200 bg-white p-5">
      <dl className="grid gap-4 text-sm sm:grid-cols-2"><div><dt className="text-slate-500">Changed by</dt><dd className="mt-1 font-semibold text-slate-900">{actor?.data?.full_name ?? (log.actor_id ? "Former account" : "System")}</dd></div><div><dt className="text-slate-500">When (Philippines time)</dt><dd className="mt-1 font-medium text-slate-900">{new Date(log.created_at).toLocaleString("en-PH", { dateStyle: "medium", timeStyle: "medium", timeZone: "Asia/Manila" })}</dd></div></dl>
      <p className="mt-4 border-t border-slate-100 pt-4 text-sm leading-6 text-slate-600">{auditSummary(log.action, log.old_data, log.new_data)}</p>
    </div>
    <section className="mt-6" aria-labelledby="audit-changes-heading"><h2 id="audit-changes-heading" className="mb-3 text-lg font-semibold text-slate-900">{log.action === "insert" ? "Recorded details" : log.action === "delete" ? "Details before deletion" : "Changes to this record"}</h2>
      <DataTableShell empty={visible.length === 0 ? <EmptyState compact kind="items" title="No business details changed" description="System information is available below. Private contact details and photos are excluded from this history." /> : undefined}>
        {changeList(visible)}
      </DataTableShell>
      {names.size > 0 && <p className="mt-3 text-xs leading-5 text-slate-500">Linked record names reflect their current names. Saved references are available below.</p>}
    </section>
    <details className="mt-5 rounded-xl border border-slate-200 bg-white"><summary className="cursor-pointer rounded-xl px-5 py-4 text-sm font-medium text-slate-600 focus-visible:outline-2 focus-visible:outline-cyan-600">System details and saved references</summary>
      <dl className="grid gap-3 border-t border-slate-100 px-5 py-4 text-xs text-slate-600"><div><dt className="font-semibold">Audit entry</dt><dd className="mt-1 break-all">{id}</dd></div><div><dt className="font-semibold">Record reference</dt><dd className="mt-1 break-all">{log.record_id ?? "Not recorded"}</dd></div><div><dt className="font-semibold">Account reference</dt><dd className="mt-1 break-all">{log.actor_id ?? "System"}</dd></div></dl>
      {technical.length > 0 && changeList(technical)}
      {changes.filter(change => change.field.endsWith("_id") && !change.technical).length > 0 && <div className="border-t border-slate-100 px-5 py-4"><h3 className="mb-2 text-sm font-semibold">Original saved references</h3><ul className="space-y-3 text-xs leading-5 text-slate-600">{changes.filter(change => change.field.endsWith("_id") && !change.technical).map(change => <li key={change.field}><span className="font-semibold">{change.label}</span><pre className="mt-1 whitespace-pre-wrap break-all font-sans">{JSON.stringify({ previous: log.old_data && typeof log.old_data === "object" && !Array.isArray(log.old_data) ? log.old_data[change.field] : null, new: log.new_data && typeof log.new_data === "object" && !Array.isArray(log.new_data) ? log.new_data[change.field] : null }, null, 2)}</pre></li>)}</ul></div>}
    </details>
  </>;
}
