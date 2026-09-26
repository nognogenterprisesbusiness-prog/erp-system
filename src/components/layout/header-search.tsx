import { SearchField } from "@/components/ui/search-field";

export function HeaderSearch({ initialQuery = "" }: { initialQuery?: string }) {
  return <form action="/projects" method="get" role="search" className="max-w-sm">
    <SearchField name="q" defaultValue={initialQuery} maxLength={80} label="Search projects" placeholder="Search projects" wrapperClassName="sm:w-full" />
  </form>;
}
