import Link from "next/link";
import Image from "next/image";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { PageHeader } from "@/components/ui/page-header";
import { requireUser } from "@/lib/auth";
import { getDailyReport } from "@/lib/data/daily-reports";
import { recordPhotoUrl } from "@/lib/media/record-photo-url";
import { DailyReportReview } from "@/components/reports/daily-report-review";
import { DailyReportCorrection } from "@/components/reports/daily-report-correction";
import { ProjectProgressForm } from "@/components/reports/project-progress-form";
import { getReportProgress } from "@/lib/data/project-operations";
import { createClient } from "@/lib/supabase/server";

const date = (value: string) => new Intl.DateTimeFormat("en-PH", { dateStyle: "medium", timeZone: "Asia/Manila" }).format(new Date(`${value}T00:00:00+08:00`));
const dateTime = (value: string) => new Intl.DateTimeFormat("en-PH", { dateStyle: "medium", timeStyle: "short", timeZone: "Asia/Manila" }).format(new Date(value));

function ReportText({ label, value }: { label: string; value: string | null }) {
  return <div><h3 className="text-xs font-semibold uppercase tracking-[0.12em] text-slate-400">{label}</h3><p className="mt-2 whitespace-pre-wrap text-sm leading-6 text-slate-700">{value || "Not recorded"}</p></div>;
}

function snapshotText(value: unknown, field: string) {
  if (!value || typeof value !== "object" || Array.isArray(value)) return "";
  const candidate = (value as Record<string, unknown>)[field];
  return typeof candidate === "string" ? candidate : "";
}

export default async function DailyReportDetailPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const [user, data, progress] = await Promise.all([requireUser(), getDailyReport(id), getReportProgress(id)]);
  const { report, project, site, preparerName, events } = data;
  const canEdit = report.status === "draft" && user.userId === report.prepared_by;
  const canCorrect = report.status === "requires_revision" && user.userId === report.prepared_by;
  let canReview = report.status === "submitted" && user.userId !== report.prepared_by && user.canManage;
  if (!canReview && report.status === "submitted" && user.userId !== report.prepared_by && user.roles.includes("project_manager")) {
    const supabase = await createClient();
    const { data: assignments, error } = await supabase.from("project_assignments").select("id")
      .eq("project_id", report.project_id).eq("user_id", user.userId)
      .eq("assignment_role", "project_manager").eq("status", "active").limit(1);
    if (error) throw new Error("Unable to verify report review access.");
    canReview = Boolean(assignments?.length);
  }
  const canRecordProgress = report.status === "approved" && !progress && (user.canManage ||
    (user.roles.includes("project_manager") && Boolean((await (await createClient()).from("project_assignments").select("id")
      .eq("project_id", report.project_id).eq("user_id", user.userId).eq("assignment_role", "project_manager")
      .eq("status", "active").limit(1)).data?.length)));
  return <>
    <PageHeader eyebrow={report.report_number} title="Daily construction report" description={`${project.code} · ${project.name} · ${site.name}`}
      action={<div className="flex flex-wrap gap-2"><Button variant="outline" asChild><Link href={`/projects/${report.project_id}/reports`}>Project reports</Link></Button>{canEdit && <Button asChild><Link href={`/reports/daily/${id}/edit`}>Edit draft</Link></Button>}{canCorrect && <DailyReportCorrection reportId={id} />}</div>} />
    <section className="mt-7 rounded-xl border border-slate-200 bg-white p-5 sm:p-6">
      {report.photo_path && <div className="relative mb-6 h-56 overflow-hidden rounded-xl bg-slate-100 sm:h-72"><Image src={recordPhotoUrl("daily-reports", report.id)} alt={`Site photo for ${report.report_number}`} fill sizes="(max-width: 640px) 100vw, 960px" unoptimized className="object-cover" /></div>}
      <div className="flex flex-wrap items-center justify-between gap-3"><h2 className="text-base font-semibold">Report details</h2><Badge variant={report.status === "draft" || report.status === "requires_revision" ? "review" : report.status === "approved" ? "active" : "neutral"}>{report.status.replaceAll("_", " ")}</Badge></div>
      <dl className="mt-5 grid gap-5 border-t border-slate-100 pt-5 sm:grid-cols-2 xl:grid-cols-4">
        <div><dt className="text-xs text-slate-400">Reporting date</dt><dd className="mt-1 text-sm font-medium">{date(report.report_date)}</dd></div>
        <div><dt className="text-xs text-slate-400">Site</dt><dd className="mt-1 text-sm font-medium">{site.name}</dd></div>
        <div><dt className="text-xs text-slate-400">Prepared by</dt><dd className="mt-1 text-sm font-medium">{preparerName}</dd></div>
        <div><dt className="text-xs text-slate-400">Submitted</dt><dd className="mt-1 text-sm font-medium">{report.submitted_at ? dateTime(report.submitted_at) : "Not submitted"}</dd></div>
      </dl>
      <div className="mt-6 grid gap-6 border-t border-slate-100 pt-6 lg:grid-cols-2">
        <ReportText label="Work description" value={report.work_description} />
        <ReportText label="Accomplishments" value={report.accomplishments} />
        <ReportText label="Issues encountered" value={report.issues_encountered} />
        <ReportText label="Site observations" value={report.site_observations} />
        <ReportText label="General remarks" value={report.general_remarks} />
        <ReportText label="Weather conditions" value={report.weather_conditions} />
      </div>
    </section>
    {canReview && <DailyReportReview reportId={id} />}
    {progress && <section className="mt-5 rounded-xl border border-slate-200 bg-white p-5 sm:p-6"><h2 className="text-base font-semibold">Project progress · {progress.completion_percent}%</h2><p className="mt-2 text-sm text-slate-600">{progress.summary}</p><Button variant="outline" size="sm" className="mt-4" asChild><Link href={`/projects/${report.project_id}/progress`}>View progress history</Link></Button></section>}
    {canRecordProgress && <ProjectProgressForm reportId={id} />}
    <section className="mt-5 rounded-xl border border-slate-200 bg-white p-5 sm:p-6">
      <h2 className="font-semibold">Report history</h2><p className="mt-1 text-xs text-slate-500">Each saved version and submission is recorded with its author and time.</p>
      <div className="mt-5 divide-y divide-slate-100 border-t border-slate-100">{events.map((event) => <details key={event.id} className="py-4">
        <summary className="cursor-pointer text-sm font-medium">Revision {event.revision} · {event.event_type.replaceAll("_", " ")}<span className="ml-2 text-xs font-normal text-slate-500">{event.actorName} · {dateTime(event.occurred_at)}</span></summary>
        <div className="mt-4 grid gap-4 rounded-lg bg-slate-50 p-4 sm:grid-cols-2">
          <ReportText label="Report date" value={snapshotText(event.report_snapshot, "report_date")} />
          <ReportText label="Weather" value={snapshotText(event.report_snapshot, "weather_conditions")} />
          <ReportText label="Work description" value={snapshotText(event.report_snapshot, "work_description")} />
          <ReportText label="Accomplishments" value={snapshotText(event.report_snapshot, "accomplishments")} />
          <ReportText label="Issues" value={snapshotText(event.report_snapshot, "issues_encountered")} />
          <ReportText label="Observations" value={snapshotText(event.report_snapshot, "site_observations")} />
          <ReportText label="Remarks" value={snapshotText(event.report_snapshot, "general_remarks")} />
          {snapshotText(event.report_snapshot, "review_note") && <ReportText label="Review note" value={snapshotText(event.report_snapshot, "review_note")} />}
        </div>
      </details>)}</div>
    </section>
  </>;
}
