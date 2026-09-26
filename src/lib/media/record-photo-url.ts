export type RecordPhotoKind = "projects" | "warehouses" | "daily-reports" | "materials" | "suppliers" | "assets";

export function recordPhotoUrl(kind: RecordPhotoKind, id: string, version?: string) {
  const path = `/record-photos/${kind}/${id}`;
  return version ? `${path}?v=${encodeURIComponent(version)}` : path;
}
