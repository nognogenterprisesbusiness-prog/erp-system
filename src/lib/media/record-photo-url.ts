export type RecordPhotoKind = "projects" | "warehouses" | "daily-reports" | "materials" | "suppliers";

export function recordPhotoUrl(kind: RecordPhotoKind, id: string) {
  return `/record-photos/${kind}/${id}`;
}
