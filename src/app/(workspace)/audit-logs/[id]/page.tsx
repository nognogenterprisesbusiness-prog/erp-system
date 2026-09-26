import { IntentLink as Link } from "@/components/layout/intent-link";
import { notFound } from "next/navigation";
import { Button } from "@/components/ui/button";
import { DataTableShell } from "@/components/ui/data-table-shell";
import { EmptyState } from "@/components/ui/empty-state";
import { PageHeader } from "@/components/ui/page-header";
import { tableHeadClass } from "@/components/ui/table-sort-heading";
import { requireUser } from "@/lib/auth";
import { changedAuditFields } from "@/lib/audit/diff";
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
  const changes = changedAuditFields(log.old_data, log.new_data);
  return <>
    <PageHeader eyebrow="Audit inspection" title={`${log.action} · ${log.table_name.replaceAll("_", " ")}`}
      description={`${new Date(log.created_at).toLocaleString("en-PH", { timeZone: "Asia/Manila" })} · ${actor?.data?.full_name ?? "System or former account"}`}
      action={<Button asChild variant="outline"><Link href="/audit-logs">All audit logs</Link></Button>} />
    <div className="mt-6 rounded-xl border border-slate-200 bg-white p-5 text-sm">
      <p><span className="font-semibold text-slate-700">Record ID:</span> <span className="break-all font-mono text-xs">{log.record_id ?? "—"}</span></p>
      <p className="mt-2"><span className="font-semibold text-slate-700">Actor ID:</span> <span className="break-all font-mono text-xs">{log.actor_id ?? "System"}</span></p>
    </div>
    <section className="mt-7"><h2 className="mb-3 text-lg font-semibold text-slate-900">Changed fields</h2>
      <DataTableShell empty={changes.length === 0 ? <EmptyState compact kind="items" title="No visible field changes" description="Sensitive contact fields are excluded from audit snapshots." /> : undefined}>
        <table className="w-full min-w-[720px] text-left text-sm"><thead className={tableHeadClass}><tr><th className="px-5 py-3">Field</th><th className="px-4 py-3">Before</th><th className="px-5 py-3">After</th></tr></thead>
          <tbody className="divide-y divide-slate-100">{changes.map((change) => <tr key={change.field} className="align-top"><th scope="row" className="px-5 py-3 font-medium text-slate-800">{change.field.replaceAll("_", " ")}</th><td className="max-w-sm break-words px-4 py-3 font-mono text-xs text-slate-600">{change.before}</td><td className="max-w-sm break-words px-5 py-3 font-mono text-xs text-slate-800">{change.after}</td></tr>)}</tbody>
        </table>
      </DataTableShell>
    </section>
  </>;
}
