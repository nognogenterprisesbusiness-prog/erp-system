import Link from "next/link";
import { SearchField } from "@/components/ui/search-field";
import { ListFilterBar } from "@/components/ui/list-filter-bar";
import { ProjectListPickers } from "@/components/projects/project-list-pickers";
import { ProjectSummaryCard } from "@/components/projects/project-summary-card";
import { ProjectForm } from "@/components/projects/project-form";
import { RecordCreateDialog } from "@/components/ui/record-create-dialog";
import { Button } from "@/components/ui/button";
import { EmptyState } from "@/components/ui/empty-state";
import { requireUser } from "@/lib/auth";
import { getAssignableProfiles, getProjects } from "@/lib/data/projects";
import { recordPhotoUrl } from "@/lib/media/record-photo-url";
import type { ProjectStatus } from "@/types/database";

const statuses = ["all", "draft", "active", "on_hold", "completed", "cancelled"] as const;
const labels: Record<ProjectStatus, string> = { draft: "Draft", active: "Active", on_hold: "On hold", completed: "Completed", cancelled: "Cancelled" };
const tones: Record<ProjectStatus, "active" | "warning" | "neutral"> = { draft: "neutral", active: "active", on_hold: "warning", completed: "active", cancelled: "neutral" };
const money = new Intl.NumberFormat("en-PH", { style: "currency", currency: "PHP", maximumFractionDigits: 0 });
const date = (value: string) => new Intl.DateTimeFormat("en-PH", { dateStyle: "medium" }).format(new Date(`${value}T00:00:00`));

export default async function ProjectsPage({ searchParams }: { searchParams: Promise<Record<string, string | string[] | undefined>> }) {
  const params = await searchParams;
  const query = typeof params.q === "string" ? params.q : "";
  const status = typeof params.status === "string" && statuses.includes(params.status as typeof statuses[number]) ? params.status as typeof statuses[number] : "all";
  const sort = params.sort === "name" || params.sort === "target" || params.sort === "code" || params.sort === "budget" || params.sort === "client" || params.sort === "status" ? params.sort : "newest";
  const direction = params.direction === "asc" ? "asc" : "desc";
  const page = typeof params.page === "string" ? Number.parseInt(params.page, 10) || 1 : 1;
  const user = await requireUser();
  const data = await getProjects({ query, status, sort, direction, page, includeProgress: user.canViewDailyReports });
  const creating = user.canManage && params.create === "1";
  const profiles = creating ? await getAssignableProfiles("engineer") : [];
  const href = (changes: { page?: number; status?: typeof status; sort?: typeof sort; direction?: typeof direction }) => {
    const value = new URLSearchParams();
    if (query) value.set("q", query);
    const nextStatus = changes.status ?? status;
    const nextSort = changes.sort ?? sort;
    const nextDirection = changes.direction ?? direction;
    if (nextStatus !== "all") value.set("status", nextStatus);
    if (nextSort !== "newest") value.set("sort", nextSort);
    if (nextDirection !== "desc") value.set("direction", nextDirection);
    if (changes.page && changes.page > 1) value.set("page", String(changes.page));
    return `/projects?${value}`;
  };
  return <>
    <div className="flex flex-col gap-4 sm:flex-row sm:items-end sm:justify-between">
      <div><p className="text-xs font-semibold uppercase tracking-[0.18em] text-cyan-700">Project control</p><h1 className="mt-1.5 text-3xl font-semibold tracking-[-0.035em]">Projects</h1><p className="mt-1 text-sm text-slate-500">Search and manage the project records available to you.</p></div>
      {user.canManage && <><Button asChild><Link href={`${href({ page })}${href({ page }).endsWith("?") ? "" : "&"}create=1`}>Add project</Link></Button>{creating && <RecordCreateDialog title="Add project" initialOpen hideTrigger closeHref={href({ page })}><ProjectForm profiles={profiles} /></RecordCreateDialog>}</>}
    </div>
    <ListFilterBar>
      <SearchField name="q" defaultValue={query} label="Search projects" placeholder="Search name, code, or client" />
      {status !== "all" && <input type="hidden" name="status" value={status} />}
      {sort !== "newest" && <input type="hidden" name="sort" value={sort} />}
      {direction !== "desc" && <input type="hidden" name="direction" value={direction} />}
      <div className="w-full sm:w-auto"><ProjectListPickers query={query} status={status} sort={sort} direction={direction} /></div>
    </ListFilterBar>
    {data.projects.length === 0 ? <div className="mt-5 rounded-2xl border border-slate-200 bg-white"><EmptyState kind={query || status !== "all" ? "results" : "items"} title={query || status !== "all" ? "No matching projects" : "No projects yet"} description={query || status !== "all" ? "Try changing the search or status." : "Create a project to start tracking work."} /></div> : <section aria-label="Project list" className="mt-5 grid gap-4 md:grid-cols-2 xl:grid-cols-3">{data.projects.map((project) => <ProjectSummaryCard key={project.id} href={`/projects/${project.id}`} code={project.code} name={project.name} location={project.city_province.split(",")[0]} photo={project.photo_path ? recordPhotoUrl("projects", project.id) : null} progress={project.progress} showProgress={user.canViewDailyReports} status={labels[project.status]} statusTone={tones[project.status]} details={[
      { label: "Client", value: project.client_name },
      { label: "Assigned staff", value: project.assignedPersonnel.join(", ") || "Unassigned" },
      { label: "Timeline", value: `${date(project.start_date)} – ${date(project.target_completion_date)}` },
      ...(user.canViewLaborRates ? [{ label: "Initial budget", value: money.format(project.initial_budget) }] : []),
    ]} />)}</section>}
    <div className="mt-4 flex items-center justify-between gap-3 text-xs text-slate-500"><span>{data.count} project{data.count === 1 ? "" : "s"}</span><div className="flex gap-2">{data.page > 1 && <Button variant="outline" size="sm" asChild><Link href={href({ page: data.page - 1 })}>Previous</Link></Button>}{data.page < data.pageCount && <Button variant="outline" size="sm" asChild><Link href={href({ page: data.page + 1 })}>Next</Link></Button>}</div></div>
  </>;
}
