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
