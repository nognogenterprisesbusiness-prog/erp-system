import { Suspense } from "react";
import { notFound } from "next/navigation";
import { uuidSchema } from "@nognog/domain";
import { Download04Icon, File02Icon, FilePenLineIcon, Upload04Icon } from "@hugeicons/core-free-icons";
import { HugeiconsIcon } from "@hugeicons/react";
import { IntentLink as Link } from "@/components/layout/intent-link";
import { ProjectDocumentUpload } from "@/components/projects/project-document-upload";
import { DocumentFilters as DocumentFilterPickers } from "@/components/projects/document-filters";
import { Button } from "@/components/ui/button";
import { EmptyState } from "@/components/ui/empty-state";
import { MetricCard } from "@/components/ui/metric-card";
import { PageHeader } from "@/components/ui/page-header";
import { RecordCreateDialog } from "@/components/ui/record-create-dialog";
import { SearchField } from "@/components/ui/search-field";
import { requireUser } from "@/lib/auth";
import { getDocumentCounts, getDocumentPage, getDocumentProjects, type DocumentFilters } from "@/lib/data/project-documents";
import { safeSearchTerm } from "@/lib/data/search";

const date = new Intl.DateTimeFormat("en-PH", { dateStyle: "medium" });
const fileSize = (bytes: number) => bytes < 1024 * 1024 ? `${Math.max(1, Math.round(bytes / 1024))} KB` : `${(bytes / (1024 * 1024)).toFixed(1)} MB`;

function documentsHref(filters: DocumentFilters, page = filters.page) {
  const params = new URLSearchParams();
  if (filters.query) params.set("q", filters.query);
  if (filters.projectId) params.set("project", filters.projectId);
  if (filters.category !== "all") params.set("category", filters.category);
  if (page > 1) params.set("page", String(page));
  return `/documents${params.size ? `?${params}` : ""}`;
}

async function UploadAction({ filters, initialOpen }: { filters: DocumentFilters; initialOpen: boolean }) {
  const projects = await getDocumentProjects();
  if (projects.length === 0) return <Button disabled>Upload document</Button>;
  return <RecordCreateDialog title="Upload documents" triggerLabel="Upload document" triggerIcon={<HugeiconsIcon icon={Upload04Icon} size={17} strokeWidth={1.6} />} initialOpen={initialOpen} closeHref={documentsHref(filters)}>
    <p className="mb-5 text-sm text-slate-600">Choose a project and upload its files. Each document stays with that project.</p>
    <ProjectDocumentUpload projects={projects} initialProjectId={filters.projectId} />
  </RecordCreateDialog>;
}

async function DocumentStats() {
  const counts = await getDocumentCounts();
  return <section aria-label="Document totals" className="mt-6 grid grid-cols-2 gap-3 sm:grid-cols-3">
    <div className="col-span-2 sm:col-span-1"><MetricCard label="Total documents" value={counts.total} icon={File02Icon} tone="bg-blue-50 text-blue-600" /></div>
    <MetricCard label="Initial documents" value={counts.initial} icon={FilePenLineIcon} tone="bg-cyan-50 text-cyan-700" />
    <MetricCard label="Other documents" value={counts.other} icon={File02Icon} tone="bg-violet-50 text-violet-700" />
  </section>;
}

function DocumentStatsSkeleton() {
  return <div role="status" aria-label="Loading document totals" className="mt-6 grid grid-cols-2 gap-3 sm:grid-cols-3">{Array.from({ length: 3 }, (_, index) => <div key={index} aria-hidden className={`h-28 animate-pulse rounded-2xl border border-slate-200 bg-white motion-reduce:animate-none ${index === 0 ? "col-span-2 sm:col-span-1" : ""}`} />)}</div>;
}

async function DocumentResults({ filters }: { filters: DocumentFilters }) {
  const result = await getDocumentPage(filters);
  return <section className="mt-5 rounded-2xl border border-slate-200 bg-white p-5 sm:p-6" aria-label="Document list">
    <div className="flex flex-wrap items-center justify-between gap-2"><h2 className="text-base font-semibold">Documents</h2><span className="text-xs text-slate-500">{result.count} document{result.count === 1 ? "" : "s"}</span></div>
    {result.documents.length === 0 ? <EmptyState kind={filters.query || filters.projectId || filters.category !== "all" ? "results" : "items"} title="No documents found" description={filters.query || filters.projectId || filters.category !== "all" ? "Try another search or filter." : "Upload a document to start the project file library."} /> : <div className="mt-4 space-y-3">{result.documents.map((document) => <article key={document.id} className="flex min-w-0 items-center gap-3 rounded-xl border border-slate-200 p-3 sm:gap-4 sm:p-4">
      <span aria-hidden="true" className="grid size-11 shrink-0 place-items-center rounded-xl bg-cyan-50 text-cyan-700"><HugeiconsIcon icon={File02Icon} size={22} strokeWidth={1.5} /></span>
      <div className="min-w-0 flex-1"><h3 className="truncate text-sm font-semibold text-slate-900" title={document.file_name}>{document.file_name}</h3><p className="mt-1 flex flex-wrap gap-x-2 gap-y-0.5 text-xs text-slate-500"><span>{document.category === "initial" ? "Initial documents" : "Other"}</span><span aria-hidden="true">·</span><span>{fileSize(document.file_size)}</span><span aria-hidden="true">·</span>{document.project ? <Link href={`/projects/${document.project_id}`} className="font-medium text-cyan-700 hover:underline">{document.project.code} · {document.project.name}</Link> : <span>Project unavailable</span>}<span aria-hidden="true">·</span><time dateTime={document.created_at}>{date.format(new Date(document.created_at))}</time></p></div>
      <Button variant="outline" size="icon" asChild><a href={`/project-documents/${document.id}`} aria-label={`Download ${document.file_name}`} title="Download"><HugeiconsIcon icon={Download04Icon} size={18} strokeWidth={1.6} /></a></Button>
    </article>)}</div>}
    {result.pageCount > 1 && <div className="mt-5 flex items-center justify-between gap-3 border-t border-slate-100 pt-4 text-xs text-slate-500"><span>Page {result.page} of {result.pageCount}</span><div className="flex gap-2">{result.page > 1 && <Button variant="outline" size="sm" asChild><Link href={documentsHref(filters, result.page - 1)}>Previous</Link></Button>}{result.page < result.pageCount && <Button variant="outline" size="sm" asChild><Link href={documentsHref(filters, result.page + 1)}>Next</Link></Button>}</div></div>}
  </section>;
}

function DocumentResultsSkeleton() {
  return <section role="status" aria-label="Loading documents" className="mt-5 rounded-2xl border border-slate-200 bg-white p-5 sm:p-6"><h2 className="text-base font-semibold">Documents</h2><div className="mt-4 space-y-3">{Array.from({ length: 4 }, (_, index) => <div key={index} aria-hidden className="h-20 animate-pulse rounded-xl bg-slate-100 motion-reduce:animate-none" />)}</div></section>;
}

export default async function DocumentsPage({ searchParams }: { searchParams: Promise<Record<string, string | string[] | undefined>> }) {
  const [params, user] = await Promise.all([searchParams, requireUser()]);
  const filters: DocumentFilters = {
    query: safeSearchTerm(typeof params.q === "string" ? params.q : ""),
    projectId: typeof params.project === "string" && uuidSchema.safeParse(params.project).success ? params.project : "",
    category: params.category === "initial" || params.category === "other" ? params.category : "all",
    page: typeof params.page === "string" ? Math.min(10000, Math.max(1, Number.parseInt(params.page, 10) || 1)) : 1,
  };
  if (!user.canManage && !user.canViewDailyReports) notFound();

  return <>
    <PageHeader eyebrow="Project control" title="Documents" description="Find project files and upload documents where they belong." action={user.canManage && <Suspense fallback={<Button disabled>Upload document</Button>}><UploadAction filters={filters} initialOpen={params.upload === "1"} /></Suspense>} />
    <Suspense fallback={<DocumentStatsSkeleton />}><DocumentStats /></Suspense>
    <div className="mt-6 flex flex-wrap items-center gap-3" role="search">
      <form method="get" action="/documents" className="w-full sm:w-auto">
        <SearchField label="Search documents" name="q" defaultValue={filters.query} placeholder="Search documents" />
        {filters.projectId && <input type="hidden" name="project" value={filters.projectId} />}
        {filters.category !== "all" && <input type="hidden" name="category" value={filters.category} />}
      </form>
      <Suspense fallback={<><div className="h-10 w-full rounded-lg bg-slate-100 sm:w-64" /><div className="h-10 w-full rounded-lg bg-slate-100 sm:w-44" /></>}>
        <DocumentFilterChoices query={filters.query} projectId={filters.projectId} category={filters.category} />
      </Suspense>
    </div>
    <Suspense key={`${filters.query}:${filters.projectId}:${filters.category}:${filters.page}`} fallback={<DocumentResultsSkeleton />}><DocumentResults filters={filters} /></Suspense>
  </>;
}

async function DocumentFilterChoices({ query, projectId, category }: { query: string; projectId: string; category: DocumentFilters["category"] }) {
  const projects = await getDocumentProjects();
  const selectedProjectId = projects.some((project) => project.id === projectId) ? projectId : "";
  return <DocumentFilterPickers projects={projects} query={query} projectId={selectedProjectId} category={category} />;
}
