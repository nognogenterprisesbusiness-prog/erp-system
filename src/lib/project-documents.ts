import type { ProjectDocumentCategory } from "@/types/database";

export const projectDocumentCategories: { value: ProjectDocumentCategory; label: string }[] = [
  { value: "initial", label: "Initial documents" },
  { value: "other", label: "Other" },
];

export const projectDocumentTypes = {
  "application/pdf": [".pdf"],
  "image/jpeg": [".jpg", ".jpeg"],
  "image/png": [".png"],
  "application/msword": [".doc"],
  "application/vnd.openxmlformats-officedocument.wordprocessingml.document": [".docx"],
  "application/vnd.ms-excel": [".xls"],
  "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet": [".xlsx"],
  "text/csv": [".csv"],
  "text/plain": [".txt"],
} as const;

export type ProjectDocumentContentType = keyof typeof projectDocumentTypes;

export const projectDocumentAccept = Object.values(projectDocumentTypes).flat().join(",");
export const projectDocumentMaxBytes = 10 * 1024 * 1024;
export const projectDocumentMaxFiles = 10;

export function isProjectDocumentContentType(value: string): value is ProjectDocumentContentType {
  return Object.hasOwn(projectDocumentTypes, value);
}

// File-type filter on the Documents page; each kind maps to stored content types.
export const projectDocumentFileKinds = {
  pdf: { label: "PDF", types: ["application/pdf"] },
  word: { label: "Word", types: ["application/msword", "application/vnd.openxmlformats-officedocument.wordprocessingml.document"] },
  spreadsheet: { label: "Excel / CSV", types: ["application/vnd.ms-excel", "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet", "text/csv"] },
  image: { label: "Image", types: ["image/jpeg", "image/png"] },
  text: { label: "Text", types: ["text/plain"] },
} as const satisfies Record<string, { label: string; types: readonly ProjectDocumentContentType[] }>;

export type ProjectDocumentFileKind = keyof typeof projectDocumentFileKinds;

export function isProjectDocumentFileKind(value: unknown): value is ProjectDocumentFileKind {
  return typeof value === "string" && Object.hasOwn(projectDocumentFileKinds, value);
}

// Short label shown in the file badge, e.g. "PDF" or "XLSX".
export function projectDocumentBadge(contentType: string) {
  const extension = isProjectDocumentContentType(contentType) ? projectDocumentTypes[contentType].at(-1) : undefined;
  return extension ? extension.slice(1).toUpperCase() : "FILE";
}

// PDFs and images open in the browser; other types always download.
export function canPreviewProjectDocument(contentType: string) {
  return contentType === "application/pdf" || contentType === "image/png" || contentType === "image/jpeg";
}

// Names are typed by the uploader, so add the file's extension when downloading.
export function projectDocumentDownloadName(name: string, contentType: string) {
  if (!isProjectDocumentContentType(contentType)) return name;
  const extensions: readonly string[] = projectDocumentTypes[contentType];
  return extensions.some((extension) => name.toLowerCase().endsWith(extension)) ? name : `${name}${extensions[0]}`;
}
