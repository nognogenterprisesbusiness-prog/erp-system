"use client";

import { useState } from "react";
import { IntentLink as Link } from "@/components/layout/intent-link";
import { Calendar03Icon, CheckmarkCircle02Icon, CancelCircleIcon, UserGroupIcon } from "@hugeicons/core-free-icons";
import { Button } from "@/components/ui/button";
import { DataTableShell } from "@/components/ui/data-table-shell";
import { EmptyState } from "@/components/ui/empty-state";
import { MetricCard } from "@/components/ui/metric-card";
import { SearchField } from "@/components/ui/search-field";
import { SelectPicker } from "@/components/ui/select-picker";

type Row = {
  id: string;
  position_title: string;
  project_id: string;
  employee?: { code: string; first_name: string; last_name: string };
  project?: { code: string; name: string };
  site?: { name: string };
  attendance?: { attendance_status: "present" | "absent"; hours_worked: number; rate_snapshot: number | null; cost_total: number };
};

const money = (amount: number) => new Intl.NumberFormat("en-PH", { style: "currency", currency: "PHP" }).format(amount);

export function AttendanceOverviewTable({ rows, count, page, pageCount, date, projectId, canManage }: { rows: Row[]; count: number; page: number; pageCount: number; date: string; projectId: string | null; canManage: boolean }) {
  const [query, setQuery] = useState("");
  const [status, setStatus] = useState("all");
  const visible = rows.filter((row) => {
    const attendanceStatus = row.attendance?.attendance_status ?? "unmarked";
    return (status === "all" || status === attendanceStatus) && `${row.employee?.code ?? ""} ${row.employee?.first_name ?? ""} ${row.employee?.last_name ?? ""} ${row.position_title} ${row.project?.name ?? ""} ${row.site?.name ?? ""}`.toLowerCase().includes(query.trim().toLowerCase());
  });
  const href = (target: number) => { const params = new URLSearchParams({ date, page: String(target) }); if (projectId) params.set("project", projectId); return `/attendance?${params}`; };
  const metrics = [
    { label: "Assignments", value: count, icon: UserGroupIcon, tone: "bg-cyan-50 text-cyan-700" },
    { label: "Present on page", value: rows.filter((row) => row.attendance?.attendance_status === "present").length, icon: CheckmarkCircle02Icon, tone: "bg-emerald-50 text-emerald-700" },
    { label: "Absent on page", value: rows.filter((row) => row.attendance?.attendance_status === "absent").length, icon: CancelCircleIcon, tone: "bg-red-50 text-red-700" },
    { label: "Not marked on page", value: rows.filter((row) => !row.attendance).length, icon: Calendar03Icon, tone: "bg-amber-50 text-amber-700" },
  ];
  return <>
    <div className="mt-6 grid grid-cols-2 gap-3 xl:grid-cols-4">{metrics.map((metric) => <MetricCard key={metric.label} {...metric} />)}</div>
    <div className="mt-5 flex flex-wrap items-center gap-3 [&>button[role=combobox]]:w-full sm:[&>button[role=combobox]]:w-48"><SearchField label="Search this page" placeholder="Search worker, role or site" value={query} onChange={(event) => setQuery(event.target.value)} /><SelectPicker label="Filter this page by status" value={status} onValueChange={setStatus} options={[{ value: "all", label: "All statuses" }, { value: "present", label: "Present" }, { value: "absent", label: "Absent" }, { value: "unmarked", label: "Not marked" }]} /></div>
    <DataTableShell empty={visible.length === 0 ? <EmptyState kind="results" title="No attendance matches" /> : undefined} footer={<div className="flex flex-wrap items-center justify-between gap-3"><span className="text-xs text-slate-500">{visible.length} shown on page {page} of {pageCount} · {count} assignments for this date</span><nav aria-label="Attendance pages" className="flex gap-2">{page > 1 && <Button asChild variant="outline" size="sm"><Link href={href(page - 1)}>Previous</Link></Button>}{page < pageCount && <Button asChild variant="outline" size="sm"><Link href={href(page + 1)}>Next</Link></Button>}</nav></div>}>
      <table className="w-full min-w-[760px] text-left text-sm"><thead className="bg-slate-50 text-xs font-semibold uppercase tracking-wide text-slate-500"><tr><th className="px-5 py-3">Worker</th><th className="px-4 py-3">Role</th><th className="px-4 py-3">Project / site</th><th className="px-4 py-3">Status</th><th className="px-4 py-3 text-right">Hours</th><th className="px-4 py-3 text-right">Posted cost</th>{canManage && <th className="px-5 py-3 text-right">Action</th>}</tr></thead><tbody className="divide-y divide-slate-100">{visible.map((row) => <tr key={row.id} className="hover:bg-slate-50/60"><td className="px-5 py-3"><p className="font-medium text-slate-900">{row.employee ? `${row.employee.first_name} ${row.employee.last_name}` : "Worker"}</p><p className="text-xs text-slate-500">{row.employee?.code}</p></td><td className="px-4 py-3 text-slate-600">{row.position_title}</td><td className="px-4 py-3"><p className="font-medium text-slate-800">{row.project?.name ?? "Project"}</p><p className="text-xs text-slate-500">{row.site?.name ?? "Site"}</p></td><td className="px-4 py-3"><span className={`inline-flex rounded-full px-2.5 py-1 text-xs font-semibold ${row.attendance?.attendance_status === "present" ? "bg-emerald-50 text-emerald-700" : row.attendance?.attendance_status === "absent" ? "bg-red-50 text-red-700" : "bg-slate-100 text-slate-600"}`}>{row.attendance?.attendance_status === "present" ? "Present" : row.attendance?.attendance_status === "absent" ? "Absent" : "Not marked"}</span></td><td className="px-4 py-3 text-right tabular-nums">{row.attendance ? `${row.attendance.hours_worked} h` : "—"}</td><td className="px-4 py-3 text-right tabular-nums">{row.attendance ? money(row.attendance.cost_total) : "—"}</td>{canManage && <td className="px-5 py-3 text-right"><Button asChild variant="outline" size="sm"><Link href={`/projects/${row.project_id}/attendance`}>Open</Link></Button></td>}</tr>)}</tbody></table>
    </DataTableShell>
  </>;
}
