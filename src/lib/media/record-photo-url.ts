export type RecordPhotoKind = "projects" | "warehouses" | "daily-reports" | "materials";

export function recordPhotoUrl(kind: RecordPhotoKind, id: string) {
  return `/record-photos/${kind}/${id}`;
}
