import Link from "next/link";
import Image from "next/image";
import { Building03Icon, PlusSignIcon, Search01Icon } from "@hugeicons/core-free-icons";
import { HugeiconsIcon } from "@hugeicons/react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { EmptyState } from "@/components/ui/empty-state";
import { tableHeadClass } from "@/components/ui/table-sort-heading";
import { requireUser } from "@/lib/auth";
import { getProjects } from "@/lib/data/projects";
import { recordPhotoUrl } from "@/lib/media/record-photo-url";
import type { ProjectStatus } from "@/types/database";

const statuses = ["all", "draft", "active", "on_hold", "completed", "cancelled"] as const;
const labels: Record<ProjectStatus, string> = { draft: "Draft", active: "Active", on_hold: "On hold", completed: "Completed", cancelled: "Cancelled" };
const variants: Record<ProjectStatus, "active" | "review" | "neutral"> = { draft: "neutral", active: "active", on_hold: "review", completed: "active", cancelled: "neutral" };
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
  const sortHref = (column: typeof sort) => href({ sort: column, direction: sort === column && direction === "asc" ? "desc" : "asc" });
  const sortState = (column: typeof sort) => sort === column ? (direction === "asc" ? "ascending" : "descending") : "none";
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
    </form>
    <div className="mt-4 flex flex-wrap gap-2" aria-label="Filter projects by status">{statuses.map((item) => <Link key={item} href={href({ status: item })} aria-current={status === item ? "page" : undefined} className={`rounded-full border px-3 py-1.5 text-xs font-medium transition ${status === item ? "border-cyan-700 bg-cyan-700 text-white" : "border-slate-200 bg-white text-slate-600 hover:border-cyan-400"}`}>{item === "all" ? "All" : labels[item]}</Link>)}</div>
    <section className="mt-5 overflow-hidden rounded-2xl border border-slate-200 bg-white">
      {data.projects.length === 0 ? <EmptyState kind={query || status !== "all" ? "results" : "items"} title={query || status !== "all" ? "No matching projects" : "No projects yet"} description={query || status !== "all" ? "Try changing the search or status." : "Create a project to start tracking work."} /> : <div className="overflow-x-auto">
        <table className="w-full min-w-[1000px] text-left">
          <thead className={tableHeadClass}><tr><th className="px-6 py-3" aria-sort={sortState("code")}><Link href={sortHref("code")} className="hover:text-cyan-700">Code {sort === "code" ? direction === "asc" ? "↑" : "↓" : "↕"}</Link></th><th className="px-4 py-3" aria-sort={sortState("name")}><Link href={sortHref("name")} className="hover:text-cyan-700">Project {sort === "name" ? direction === "asc" ? "↑" : "↓" : "↕"}</Link></th><th className="px-4 py-3">Location</th><th className="px-4 py-3" aria-sort={sortState("status")}><Link href={sortHref("status")} className="hover:text-cyan-700">Status {sort === "status" ? direction === "asc" ? "↑" : "↓" : "↕"}</Link></th><th className="px-4 py-3" aria-sort={sortState("client")}><Link href={sortHref("client")} className="hover:text-cyan-700">Client {sort === "client" ? direction === "asc" ? "↑" : "↓" : "↕"}</Link></th><th className="px-4 py-3">Personnel</th><th className="px-4 py-3" aria-sort={sortState("target")}><Link href={sortHref("target")} className="hover:text-cyan-700">Schedule {sort === "target" ? direction === "asc" ? "↑" : "↓" : "↕"}</Link></th><th className="px-6 py-3 text-right" aria-sort={sortState("budget")}><Link href={sortHref("budget")} className="hover:text-cyan-700">Budget {sort === "budget" ? direction === "asc" ? "↑" : "↓" : "↕"}</Link></th></tr></thead>
          <tbody className="divide-y divide-slate-100">{data.projects.map((project) => <tr key={project.id} className="hover:bg-slate-50/60">
            <td className="px-6 py-4 text-xs font-semibold text-slate-600">{project.code}</td>
            <td className="px-4 py-4"><Link href={`/projects/${project.id}`} className="flex items-center gap-3 text-sm font-semibold text-slate-800 hover:text-cyan-700"><span className="relative grid size-11 shrink-0 place-items-center overflow-hidden rounded-lg bg-slate-100 text-slate-400">{project.photo_path ? <Image src={recordPhotoUrl("projects", project.id)} alt="" fill sizes="44px" unoptimized className="object-cover" /> : <HugeiconsIcon icon={Building03Icon} size={19} />}</span><span>{project.name}</span></Link></td>
            <td className="px-4 py-4 text-xs text-slate-600">{project.city_province.split(",")[0]}</td>
            <td className="px-4 py-4"><Badge variant={variants[project.status]}>{labels[project.status]}</Badge></td>
            <td className="px-4 py-4 text-xs text-slate-600">{project.client_name}</td>
            <td className="max-w-52 px-4 py-4 text-xs text-slate-500"><span className="line-clamp-2">{project.assignedPersonnel.length ? project.assignedPersonnel.join(", ") : "Unassigned"}</span></td>
            <td className="px-4 py-4 text-xs text-slate-500"><span className="block">{date(project.start_date)}</span><span className="mt-1 block">to {date(project.target_completion_date)}</span></td>
            <td className="px-4 py-4 text-xs font-semibold text-slate-700">{money.format(project.initial_budget)}</td>
          </tr>)}</tbody>
        </table>
      </div>}
      <div className="flex items-center justify-between border-t border-slate-100 px-6 py-4 text-xs text-slate-500"><span>{data.count} project{data.count === 1 ? "" : "s"}</span><div className="flex gap-2">{data.page > 1 && <Button variant="outline" size="sm" asChild><Link href={href({ page: data.page - 1 })}>Previous</Link></Button>}{data.page < data.pageCount && <Button variant="outline" size="sm" asChild><Link href={href({ page: data.page + 1 })}>Next</Link></Button>}</div></div>
    </section>
  </>;
}
