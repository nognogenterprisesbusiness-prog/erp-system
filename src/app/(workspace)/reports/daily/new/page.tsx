import { randomUUID } from "node:crypto";
import Link from "next/link";
import { uuidSchema } from "@nognog/domain";
import { DailyReportForm } from "@/components/reports/daily-report-form";
import { Button } from "@/components/ui/button";
import { PageHeader } from "@/components/ui/page-header";
import { getDailyReportChoices } from "@/lib/data/daily-reports";
import { todayInManila } from "@/lib/date";

export default async function NewDailyReportPage({ searchParams }: { searchParams: Promise<{ project?: string }> }) {
  const params = await searchParams;
  const selected = uuidSchema.safeParse(params.project);
  const choices = await getDailyReportChoices();
  const initialProjectId = selected.success && choices.projects.some((project) => project.id === selected.data) ? selected.data : undefined;
  return <>
    <PageHeader eyebrow="Site reporting" title="Create daily report" description="Save a draft or submit the day's work from any authorized project site."
      action={<Button variant="outline" asChild><Link href="/reports/daily">Back to reports</Link></Button>} />
    <div className="mt-7 max-w-6xl">{choices.sites.length ? <DailyReportForm initialId={randomUUID()} initialProjectId={initialProjectId} initialDate={todayInManila()} projects={choices.projects} sites={choices.sites} />
      : <div className="rounded-xl border border-slate-200 bg-white px-6 py-12 text-center text-sm text-slate-500">You need an active reporting assignment and an active project site before creating a report.</div>}</div>
  </>;
}
