import { Download04Icon, ViewIcon } from "@hugeicons/core-free-icons";
import { HugeiconsIcon } from "@hugeicons/react";
import { IntentLink as Link } from "@/components/layout/intent-link";
import { Button } from "@/components/ui/button";
import { ProjectDocumentActions } from "@/components/projects/project-document-actions";
import { canPreviewProjectDocument, projectDocumentBadge } from "@/lib/project-documents";
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
    return <li key={document.id} className="flex min-w-0 items-center gap-3 rounded-xl border border-slate-200 p-3 sm:gap-4 sm:p-4">
      <span aria-hidden="true" className="grid size-12 shrink-0 place-items-center rounded-xl bg-orange-50 text-[11px] font-semibold tracking-wide text-orange-600">{projectDocumentBadge(document.content_type)}</span>
      <div className="min-w-0 flex-1">
        <h3 className="truncate text-sm font-semibold text-slate-900" title={document.file_name}>{document.file_name}</h3>
        <p className="mt-1 flex flex-wrap items-center gap-x-2 gap-y-1 text-xs text-slate-500">
          <span className={`rounded-full px-2 py-0.5 font-medium ${chip.className}`}>{chip.label}</span>
          <span aria-hidden="true">·</span><span>{fileSize(document.file_size)}</span>
          {showProject && <><span aria-hidden="true">·</span>{document.project ? <Link href={`/projects/${document.project_id}?tab=documents`} className="font-medium text-cyan-700 hover:underline">{document.project.code} · {document.project.name}</Link> : <span>Project unavailable</span>}</>}
          {document.uploaderName && <><span aria-hidden="true">·</span><span>{document.uploaderName}</span></>}
          <span aria-hidden="true">·</span><time dateTime={document.created_at}>{date.format(new Date(document.created_at))}</time>
        </p>
      </div>
      <div className="flex shrink-0 items-center gap-1.5">
        {canPreviewProjectDocument(document.content_type) && <Button variant="outline" size="icon" asChild><a href={`/project-documents/${document.id}?view=1`} target="_blank" rel="noopener" aria-label={`View ${document.file_name}`} title="View"><HugeiconsIcon icon={ViewIcon} size={18} strokeWidth={1.6} /></a></Button>}
        <Button variant="outline" size="icon" asChild><a href={`/project-documents/${document.id}`} aria-label={`Download ${document.file_name}`} title="Download"><HugeiconsIcon icon={Download04Icon} size={18} strokeWidth={1.6} /></a></Button>
        {canManage && <ProjectDocumentActions document={document} />}
      </div>
    </li>;
  })}</ul>;
}
