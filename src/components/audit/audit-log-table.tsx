import { DataTableShell } from "@/components/ui/data-table-shell";
import { IntentLink as Link } from "@/components/layout/intent-link";
import { EmptyState } from "@/components/ui/empty-state";
import { tableHeadClass } from "@/components/ui/table-sort-heading";
import { AccountAvatar } from "@/components/ui/account-avatar";

export type AuditListRow = {
  id: string;
  actor: string;
  actorPhoto?: string;
  action: string;
  entity: string;
  recordId: string;
  detail: string;
  createdAt: string;
};

const timestamp = new Intl.DateTimeFormat("en-PH", { dateStyle: "medium", timeStyle: "short", timeZone: "Asia/Manila" });

export function AuditLogTable({ rows, total }: { rows: AuditListRow[]; total: number }) {
  return <><DataTableShell empty={rows.length ? undefined : <EmptyState title="No audit entries found" description="Recorded changes will appear here after an authorized action." />}>
    <table className="w-full min-w-[850px] text-left text-sm"><thead className={tableHeadClass}><tr>
      <th scope="col" className="px-5 py-3">When</th><th scope="col" className="px-4 py-3">Account</th><th scope="col" className="px-4 py-3">Action</th><th scope="col" className="px-4 py-3">Record</th><th scope="col" className="px-5 py-3">Detail</th>
    </tr></thead><tbody className="divide-y divide-slate-100">{rows.map((row) => <tr key={row.id} className="hover:bg-slate-50/70">
      <td className="whitespace-nowrap px-5 py-3 text-xs text-slate-600">{timestamp.format(new Date(row.createdAt))}</td>
      <td className="px-4 py-3 font-medium text-slate-800"><div className="flex items-center gap-3"><AccountAvatar name={row.actor} photo={row.actorPhoto} /><span>{row.actor}</span></div></td>
      <td className="px-4 py-3"><span className={`rounded-full px-2.5 py-1 text-xs font-semibold ${row.action === "delete" || row.action === "reject" ? "bg-red-50 text-red-700" : row.action === "create" || row.action === "approve" || row.action === "receipt" ? "bg-emerald-50 text-emerald-700" : "bg-cyan-50 text-cyan-800"}`}>{row.action.replaceAll("_", " ")}</span></td>
      <td className="px-4 py-3"><span className="block font-medium text-slate-800">{row.entity.replaceAll(/([a-z])([A-Z])/g, "$1 $2").replaceAll("_", " ")}</span><span className="block max-w-40 truncate text-[11px] text-slate-400" title={row.recordId}>{row.recordId}</span></td>
      <td className="max-w-sm px-5 py-3 text-slate-600">{row.detail}<Link href={`/audit-logs/${row.id}`} className="ml-2 whitespace-nowrap font-semibold text-cyan-700 hover:underline">Inspect</Link></td>
    </tr>)}</tbody></table>
  </DataTableShell><p className="mt-3 text-sm text-slate-500">{total} {total === 1 ? "entry" : "entries"}</p></>;
}
