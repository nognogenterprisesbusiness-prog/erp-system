import catalog from "./catalog.json";

export const locationKinds = ["regions", "provinces", "municipalities", "barangays"] as const;
export type LocationKind = (typeof locationKinds)[number];
type SearchResult<T> = { items: T[]; page: number; pageSize: number; total: number };

export function searchDemoLocations(kind: "municipalities", query: string, parent: string, page: number, pageSize: number): SearchResult<(typeof catalog.municipalities)[number]>;
export function searchDemoLocations(kind: LocationKind, query: string, parent: string, page: number, pageSize: number): SearchResult<(typeof catalog.municipalities | typeof catalog.regions | typeof catalog.provinces | typeof catalog.barangays)[number]>;
export function searchDemoLocations(kind: LocationKind, query: string, parent: string, page: number, pageSize: number) {
  const rows = kind === "regions" ? catalog.regions : kind === "provinces" ? catalog.provinces : kind === "barangays" ? catalog.barangays : catalog.municipalities;
  const filtered = rows.filter((row) => {
    if (kind === "municipalities" && !(row as (typeof catalog.municipalities)[number]).selectable) return false;
    if (parent && !("regionCode" in row && row.regionCode === parent || "provinceCode" in row && row.provinceCode === parent || "municipalityCode" in row && row.municipalityCode === parent)) return false;
    if (!query) return true;
    if (kind === "municipalities") {
      const municipality = row as (typeof catalog.municipalities)[number];
      return `${municipality.displayName} ${municipality.name} ${municipality.code}`.toLocaleLowerCase().includes(query);
    }
    return row.name.toLocaleLowerCase().includes(query) || row.code.includes(query);
  });
  return { items: filtered.slice((page - 1) * pageSize, page * pageSize), page, pageSize, total: filtered.length };
}
