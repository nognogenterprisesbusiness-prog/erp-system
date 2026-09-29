import { ListFilterBar } from "@/components/ui/list-filter-bar";
import { SearchField } from "@/components/ui/search-field";
import { ProjectListPickers } from "@/components/projects/project-list-pickers";

export const projectListHeader = {
  eyebrow: "Project control",
  title: "Projects",
  description: "Search and manage the project records available to you.",
} as const;

export function ProjectListControls({ query = "", status = "all", sort = "newest", direction = "desc" }: { query?: string; status?: string; sort?: string; direction?: "asc" | "desc" }) {
  return <ListFilterBar viewKey="projects" viewTitle="Projects">
    <SearchField key={query} name="q" defaultValue={query} label="Search projects" placeholder="Search name, code, or client" />
    {status !== "all" && <input type="hidden" name="status" value={status} />}
    {sort !== "newest" && <input type="hidden" name="sort" value={sort} />}
    {direction !== "desc" && <input type="hidden" name="direction" value={direction} />}
    <div className="w-full sm:w-auto"><ProjectListPickers query={query} status={status} sort={sort} direction={direction} /></div>
  </ListFilterBar>;
}
