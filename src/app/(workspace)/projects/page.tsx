import Link from "next/link";
import { PlusSignIcon, Search01Icon } from "@hugeicons/core-free-icons";
import { HugeiconsIcon } from "@hugeicons/react";
import { ProjectListPickers } from "@/components/projects/project-list-pickers";
import { ProjectSummaryCard } from "@/components/projects/project-summary-card";
import { Button } from "@/components/ui/button";
import { EmptyState } from "@/components/ui/empty-state";
import { requireUser } from "@/lib/auth";
import { getProjects } from "@/lib/data/projects";
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
  const [user, data] = await Promise.all([requireUser(), getProjects({ query, status, sort, direction, page })]);
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
      {user.canManage && <Button asChild className="rounded-full px-5"><Link href="/projects/new"><HugeiconsIcon icon={PlusSignIcon} size={17} /> New project</Link></Button>}
    </div>
    <form className="mt-8 flex flex-wrap gap-3 rounded-2xl border border-slate-200 bg-white p-4">
      <label className="relative"><span className="sr-only">Search projects</span><HugeiconsIcon icon={Search01Icon} size={17} className="absolute left-4 top-1/2 -translate-y-1/2 text-slate-400" /><input name="q" defaultValue={query} placeholder="Search name, code, or client" className="h-10 w-full rounded-full border border-slate-200 pl-11 pr-4 text-sm outline-none focus:border-cyan-600 focus:ring-4 focus:ring-cyan-600/10" /></label>
      {status !== "all" && <input type="hidden" name="status" value={status} />}
      {sort !== "newest" && <input type="hidden" name="sort" value={sort} />}
      {direction !== "desc" && <input type="hidden" name="direction" value={direction} />}
      <Button variant="outline" type="submit">Search</Button>
      <div className="w-full sm:ml-auto sm:w-auto"><ProjectListPickers query={query} status={status} sort={sort} direction={direction} /></div>
    </form>
    {data.projects.length === 0 ? <div className="mt-5 rounded-2xl border border-slate-200 bg-white"><EmptyState kind={query || status !== "all" ? "results" : "items"} title={query || status !== "all" ? "No matching projects" : "No projects yet"} description={query || status !== "all" ? "Try changing the search or status." : "Create a project to start tracking work."} /></div> : <section aria-label="Project list" className="mt-5 grid gap-4 md:grid-cols-2 xl:grid-cols-3">{data.projects.map((project) => <ProjectSummaryCard key={project.id} href={`/projects/${project.id}`} code={project.code} name={project.name} location={project.city_province.split(",")[0]} photo={project.photo_path ? recordPhotoUrl("projects", project.id) : null} status={labels[project.status]} statusTone={tones[project.status]} details={[
      { label: "Client", value: project.client_name },
      { label: "Assigned staff", value: project.assignedPersonnel.join(", ") || "Unassigned" },
      { label: "Timeline", value: `${date(project.start_date)} – ${date(project.target_completion_date)}` },
      { label: "Initial budget", value: money.format(project.initial_budget) },
    ]} />)}</section>}
    <div className="mt-4 flex items-center justify-between gap-3 text-xs text-slate-500"><span>{data.count} project{data.count === 1 ? "" : "s"}</span><div className="flex gap-2">{data.page > 1 && <Button variant="outline" size="sm" asChild><Link href={href({ page: data.page - 1 })}>Previous</Link></Button>}{data.page < data.pageCount && <Button variant="outline" size="sm" asChild><Link href={href({ page: data.page + 1 })}>Next</Link></Button>}</div></div>
  </>;
}
