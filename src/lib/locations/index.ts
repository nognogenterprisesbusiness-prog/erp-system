import "server-only";
import catalog from "./catalog.json";

export type Municipality = (typeof catalog.municipalities)[number];
const municipalitiesByCode = new Map(catalog.municipalities.map((row) => [row.code, row]));

export function findMunicipality(code: string): Municipality | undefined {
  return municipalitiesByCode.get(code);
}

export function municipalityDisplay(code: string | undefined, fallback: string): string {
  return code ? findMunicipality(code)?.displayName ?? fallback : fallback;
}
