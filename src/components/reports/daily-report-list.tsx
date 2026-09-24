import Link from "next/link";
import Image from "next/image";
import { Badge } from "@/components/ui/badge";
import { DataTableShell } from "@/components/ui/data-table-shell";
import { EmptyState } from "@/components/ui/empty-state";
import { tableHeadClass } from "@/components/ui/table-sort-heading";
import type { DailyReportStatus } from "@/types/database";
import { recordPhotoUrl } from "@/lib/media/record-photo-url";

export type DailyReportListItem = {
  id: string; report_number: string; report_date: string; status: DailyReportStatus;
  photo_path: string | null;
  project?: { code: string; name: string }; siteName: string; preparerName: string;
};

const date = (value: string) => new Intl.DateTimeFormat("en-PH", { dateStyle: "medium", timeZone: "Asia/Manila" }).format(new Date(`${value}T00:00:00+08:00`));

export function DailyReportList({ reports, count }: { reports: DailyReportListItem[]; count: number }) {
  if (!reports.length) return <DataTableShell empty={<EmptyState kind="results" title="No daily reports found" description="Adjust the filters or create a report for an assigned project." />}>{null}</DataTableShell>;
  return <><DataTableShell>
    <table className="w-full min-w-[780px] text-left">
      <thead className={tableHeadClass}><tr><th className="px-5 py-3">Code</th><th className="px-4 py-3">Project / site</th><th className="px-4 py-3">Prepared by</th><th className="px-4 py-3">Date</th><th className="px-5 py-3 text-right">Status</th></tr></thead>
      <tbody className="divide-y divide-slate-100">{reports.map((report) => <tr key={report.id} className="hover:bg-slate-50/70">
        <td className="px-5 py-4"><Link href={`/reports/daily/${report.id}`} className="text-sm font-semibold hover:text-cyan-700">{report.report_number}</Link></td>
        <td className="px-4 py-4"><div className="flex items-center gap-3">{report.photo_path ? <span className="relative size-10 shrink-0 overflow-hidden rounded-lg bg-slate-100"><Image src={recordPhotoUrl("daily-reports", report.id)} alt="" fill sizes="40px" unoptimized className="object-cover" /></span> : null}<span><span className="block font-medium">{report.project?.name ?? "Unavailable project"}</span><span className="mt-0.5 block text-xs text-slate-400">{report.project?.code} · {report.siteName}</span></span></div></td>
        <td className="px-4 py-4 text-sm text-slate-600">{report.preparerName}</td>
        <td className="px-4 py-4 text-sm text-slate-600">{date(report.report_date)}</td>
        <td className="px-5 py-4 text-right"><Badge variant={report.status === "approved" ? "active" : report.status === "draft" || report.status === "requires_revision" ? "review" : "neutral"}>{report.status.replaceAll("_", " ")}</Badge></td>
      </tr>)}</tbody>
    </table>
  </DataTableShell><p className="mt-3 text-sm text-slate-500">{count} report{count === 1 ? "" : "s"}</p></>;
}
