import { ListFilterBar } from "@/components/ui/list-filter-bar";
import Link from "next/link";
import { uuidSchema } from "@nognog/domain";
import { AttendanceOverviewTable } from "@/components/workforce/attendance-overview-table";
import { Button } from "@/components/ui/button";
import { DatePicker } from "@/components/ui/date-picker";
import { PageHeader } from "@/components/ui/page-header";
import { SelectPicker } from "@/components/ui/select-picker";
import { requireFinanceViewer } from "@/lib/auth";
import { getAttendanceOverview } from "@/lib/data/attendance-overview";
import { createClient } from "@/lib/supabase/server";

function validDate(value: unknown): value is string {
  if (typeof value !== "string" || !/^\d{4}-\d{2}-\d{2}$/.test(value)) return false;
  const parsed = new Date(`${value}T12:00:00Z`);
  return !Number.isNaN(parsed.getTime()) && parsed.toISOString().slice(0, 10) === value;
}

export default async function AttendancePage({ searchParams }: { searchParams: Promise<Record<string, string | string[] | undefined>> }) {
  const user = await requireFinanceViewer();
  const params = await searchParams;
  const today = new Intl.DateTimeFormat("sv-SE", { timeZone: "Asia/Manila", year: "numeric", month: "2-digit", day: "2-digit" }).format(new Date());
  const date = validDate(params.date) ? params.date : today;
  const projectId = typeof params.project === "string" && uuidSchema.safeParse(params.project).success ? params.project : null;
  const requestedPage = typeof params.page === "string" ? Number(params.page) : 1;
  const page = Number.isSafeInteger(requestedPage) && requestedPage >= 1 ? requestedPage : 1;
  const supabase = await createClient();
  const [projectsResult, result] = await Promise.all([
    supabase.from("projects").select("id,code,name").is("archived_at", null).order("name").limit(500),
    getAttendanceOverview(date, projectId, page),
  ]);
  if (projectsResult.error) throw new Error("Unable to load attendance projects.");
  return <>
    <PageHeader title="Attendance" description="Review dated worker attendance, work hours, and posted project labor cost." action={user.canManage && projectId && <Button asChild><Link href={`/projects/${projectId}/attendance`}>Mark attendance</Link></Button>} />
    <ListFilterBar className="mt-6 flex flex-wrap items-center gap-3"><div className="w-full sm:w-48"><DatePicker key={date} label="Attendance date" name="date" defaultValue={date} allowClear={false} required /></div><div className="w-full sm:w-64"><SelectPicker key={projectId ?? "all"} label="Project" name="project" defaultValue={projectId ?? "all"} options={[{ value: "all", label: "All projects" }, ...(projectsResult.data ?? []).map((project) => ({ value: project.id, label: `${project.code} · ${project.name}` }))]} /></div></ListFilterBar>
    <AttendanceOverviewTable rows={result.rows} count={result.count} page={result.page} pageCount={result.pageCount} date={date} projectId={projectId} canManage={user.canManage} />
  </>;
}
