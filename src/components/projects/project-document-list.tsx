import { RecordFacts } from "@/components/ui/record-facts";
import { IntentLink as Link } from "@/components/layout/intent-link";
import { ProjectDocumentActions } from "@/components/projects/project-document-actions";
import { projectDocumentBadge } from "@/lib/project-documents";
import type { ProjectDocumentCategory } from "@/types/database";

export type ProjectDocumentListItem = {
  id: string;
  project_id: string;
  category: ProjectDocumentCategory;
  file_name: string;
  content_type: string;
  file_size: number;
  created_at: string;
  project: { code: string; name: string } | null;
  uploaderName: string | null;
};

const date = new Intl.DateTimeFormat("en-PH", { dateStyle: "medium" });
const fileSize = (bytes: number) => bytes < 1024 * 1024 ? `${Math.max(1, Math.round(bytes / 1024))} KB` : `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
const categoryChip: Record<ProjectDocumentCategory, { label: string; className: string }> = {
  initial: { label: "Initial documents", className: "bg-cyan-50 text-cyan-800" },
  other: { label: "Other", className: "bg-slate-100 text-slate-700" },
};

// One row per file with view and download. showProject is off inside a project page;
// canManage adds the Admin edit/delete menu.
export function ProjectDocumentList({ documents, showProject = true, canManage = false }: { documents: readonly ProjectDocumentListItem[]; showProject?: boolean; canManage?: boolean }) {
  return <ul className="mt-4 space-y-3">{documents.map((document) => {
    const chip = categoryChip[document.category];
    return <li key={document.id} className="flex min-w-0 flex-wrap items-center gap-3 rounded-xl border border-slate-200 p-3 sm:gap-4 sm:p-4">
      <span aria-hidden="true" className="grid size-12 shrink-0 place-items-center rounded-xl bg-orange-50 text-[11px] font-semibold tracking-wide text-orange-600">{projectDocumentBadge(document.content_type)}</span>
      <div className="min-w-0 flex-1">
        <h3 className="break-words text-sm font-semibold text-slate-900" title={document.file_name}>{document.file_name}</h3>
        <div className="mt-2"><span className={`inline-block rounded-full px-2 py-0.5 text-xs font-medium ${chip.className}`}>{chip.label}</span><RecordFacts className="mt-2" items={[{label:"File size",value:fileSize(document.file_size)},...(showProject ? [{label:"Project",value:document.project ? <Link href={`/projects/${document.project_id}?tab=documents`} className="hover:text-cyan-700">{document.project.name}</Link> : "Project unavailable"}] : []),...(document.uploaderName ? [{label:"Uploaded by",value:document.uploaderName}] : []),{label:"Uploaded on",value:<time dateTime={document.created_at}>{date.format(new Date(document.created_at))}</time>}]} /></div>
      </div>
      <div className="flex w-full flex-wrap items-center gap-2 sm:w-auto">
        <ProjectDocumentActions document={document} canManage={canManage} />
      </div>
    </li>;
  })}</ul>;
}
