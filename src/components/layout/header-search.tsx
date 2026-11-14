import { SearchField } from "@/components/ui/search-field";

export function HeaderSearch({ initialQuery = "", workforceOnly = false }: { initialQuery?: string; workforceOnly?: boolean }) {
  const label = workforceOnly ? "Search employees" : "Search projects";
  return <form action={workforceOnly ? "/employees" : "/projects"} method="get" role="search" className="max-w-sm">
    <SearchField name="q" defaultValue={initialQuery} maxLength={80} label={label} placeholder={label} wrapperClassName="sm:w-full" />
  </form>;
}
