import { IntentLink as Link } from "@/components/layout/intent-link";
import { Suspense } from "react";
import { ProjectListControls, projectListHeader } from "@/components/projects/project-list-controls";
import { RecordThumbnail } from "@/components/ui/record-thumbnail";
import { RecordListSkeleton, RecordListView } from "@/components/ui/record-list-view";
import { ProjectSummaryCard } from "@/components/projects/project-summary-card";
import { ProjectForm } from "@/components/projects/project-form";
import { RecordCreateDialog } from "@/components/ui/record-create-dialog";
import { Button } from "@/components/ui/button";
import { EmptyState } from "@/components/ui/empty-state";
import { PageHeader } from "@/components/ui/page-header";
import { requireUser } from "@/lib/auth";
import { getAssignableProfiles, getProjects } from "@/lib/data/projects";
import type { ProjectListParams } from "@/lib/data/projects";
import { recordPhotoUrl } from "@/lib/media/record-photo-url";
import type { ProjectStatus } from "@/types/database";

const statuses = ["all", "draft", "active", "on_hold", "completed", "cancelled"] as const;
const labels: Record<ProjectStatus, string> = { draft: "Draft", active: "Active", on_hold: "On hold", completed: "Completed", cancelled: "Cancelled" };
const tones: Record<ProjectStatus, "active" | "warning" | "neutral"> = { draft: "neutral", active: "active", on_hold: "warning", completed: "active", cancelled: "neutral" };
const date = (value: string) => new Intl.DateTimeFormat("en-PH", { dateStyle: "medium" }).format(new Date(`${value}T00:00:00`));
type Filters = { query: string; status: ProjectStatus | "all"; sort: NonNullable<ProjectListParams["sort"]>; direction: "asc" | "desc"; page: number };

function projectListHref(filters: Filters, page = filters.page) {
  const value = new URLSearchParams();
  if (filters.query) value.set("q", filters.query);
  if (filters.status !== "all") value.set("status", filters.status);
  if (filters.sort !== "newest") value.set("sort", filters.sort);
  if (filters.direction !== "desc") value.set("direction", filters.direction);
  if (page > 1) value.set("page", String(page));
  return `/projects${value.size ? `?${value}` : ""}`;
}

async function ProjectCreateAction({ creating, closeHref }: { creating: boolean; closeHref: string }) {
  const profiles = await getAssignableProfiles("engineer");
  return <RecordCreateDialog title="Add project" initialOpen={creating} closeHref={closeHref}><ProjectForm profiles={profiles} /></RecordCreateDialog>;
}

export default async function ProjectsPage({ searchParams }: { searchParams: Promise<Record<string, string | string[] | undefined>> }) {
  const params = await searchParams;
  const query = typeof params.q === "string" ? params.q : "";
  const status = typeof params.status === "string" && statuses.includes(params.status as typeof statuses[number]) ? params.status as typeof statuses[number] : "all";
  const sort: Filters["sort"] = params.sort === "name" || params.sort === "target" || params.sort === "code" || params.sort === "client" || params.sort === "status" ? params.sort : "newest";
  const direction: Filters["direction"] = params.direction === "asc" ? "asc" : "desc";
  const page = typeof params.page === "string" ? Math.max(1, Number.parseInt(params.page, 10) || 1) : 1;
  const user = await requireUser();
  const filters: Filters = { query, status, sort, direction, page };
  const creating = user.canManage && params.create === "1";
  return <>
    <PageHeader {...projectListHeader} action={user.canManage && <Suspense fallback={<Button disabled>Add project</Button>}><ProjectCreateAction creating={creating} closeHref={projectListHref(filters)} /></Suspense>} />
    <ProjectListControls query={query} status={status} sort={sort} direction={direction} />
    <Suspense key={`${query}:${status}:${sort}:${direction}:${page}`} fallback={<RecordListSkeleton storageKey="projects" columns={user.canViewDailyReports ? 6 : 5} />}>
      <ProjectResults filters={filters} canViewDailyReports={user.canViewDailyReports} />
    </Suspense>
  </>;
}

async function ProjectResults({ filters, canViewDailyReports }: { filters: Filters; canViewDailyReports: boolean }) {
  const { query, status } = filters;
  const data = await getProjects({ ...filters, includeProgress: canViewDailyReports });
  return <>
    <RecordListView storageKey="projects" title="Projects" columns={["Project", "Client", "Location", "Status", ...(canViewDailyReports ? ["Progress"] : []), "Timeline"]} rows={data.projects.map((project) => ({ id: project.id, cells: [
      <div key="record" className="flex min-w-56 items-center gap-3"><RecordThumbnail name={project.name} photo={project.photo_path ? recordPhotoUrl("projects", project.id, project.updated_at) : null} /><Link key="project" href={`/projects/${project.id}`} className="font-semibold hover:text-cyan-700">{project.code} · {project.name}</Link></div>, project.client_name, project.city_province, labels[project.status],
      ...(canViewDailyReports ? [`${project.progress ?? 0}%`] : []), `${date(project.start_date)} – ${date(project.target_completion_date)}`,
    ] }))}>
    {data.projects.length === 0 ? <div className="mt-5 rounded-2xl border border-slate-200 bg-white"><EmptyState kind={query || status !== "all" ? "results" : "items"} title={query || status !== "all" ? "No matching projects" : "No projects yet"} description={query || status !== "all" ? "Try changing the search or status." : "Create a project to start tracking work."} /></div> : <section aria-label="Project list" className="mt-5 grid gap-4 md:grid-cols-2 xl:grid-cols-3">{data.projects.map((project) => <ProjectSummaryCard key={project.id} href={`/projects/${project.id}`} code={project.code} name={project.name} location={project.city_province.split(",")[0]} photo={project.photo_path ? recordPhotoUrl("projects", project.id, project.updated_at) : null} progress={project.progress} showProgress={canViewDailyReports} status={labels[project.status]} statusTone={tones[project.status]} details={[
      { label: "Client", value: project.client_name },
      { label: "Assigned staff", value: project.assignedPersonnel.join(", ") || "Unassigned" },
      { label: "Timeline", value: `${date(project.start_date)} – ${date(project.target_completion_date)}` },
    ]} />)}</section>}
    </RecordListView>
    <div className="mt-4 flex items-center justify-between gap-3 text-xs text-slate-500"><span>{data.count} project{data.count === 1 ? "" : "s"}</span><div className="flex gap-2">{data.page > 1 && <Button variant="outline" size="sm" asChild><Link href={projectListHref(filters, data.page - 1)}>Previous</Link></Button>}{data.page < data.pageCount && <Button variant="outline" size="sm" asChild><Link href={projectListHref(filters, data.page + 1)}>Next</Link></Button>}</div></div>
  </>;
}
