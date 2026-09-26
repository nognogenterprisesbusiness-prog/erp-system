import { IntentLink as Link } from "@/components/layout/intent-link";
import { notFound } from "next/navigation";
import { DailyReportForm } from "@/components/reports/daily-report-form";
import { Button } from "@/components/ui/button";
import { PageHeader } from "@/components/ui/page-header";
import { requireUser } from "@/lib/auth";
import { getDailyReport, getDailyReportChoices } from "@/lib/data/daily-reports";
import { todayInManila } from "@/lib/date";

export default async function EditDailyReportPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const [user, data, choices] = await Promise.all([requireUser(), getDailyReport(id), getDailyReportChoices()]);
  if (data.report.status !== "draft" || data.report.prepared_by !== user.userId || !choices.projects.some((project) => project.id === data.report.project_id)) notFound();
  return <>
    <PageHeader eyebrow={data.report.report_number} title="Edit daily report draft" description="Update the draft before submitting it for review."
      action={<Button variant="outline" asChild><Link href={`/reports/daily/${id}`}>Cancel</Link></Button>} />
    <div className="mt-7 max-w-6xl"><DailyReportForm report={data.report} initialId={id} initialDate={todayInManila()} projects={choices.projects} sites={choices.sites} /></div>
  </>;
}
