import type { Json } from "@/types/database";

export type AuditFieldChange = { field: string; before: string; after: string };

function fields(value: Json | null): Record<string, Json | undefined> {
  return value !== null && typeof value === "object" && !Array.isArray(value) ? value : {};
}

function describe(value: Json | undefined): string {
  if (value === undefined) return "—";
  if (value === null) return "null";
  if (typeof value === "string") return value || "(empty)";
  return JSON.stringify(value);
}

export function changedAuditFields(oldData: Json | null, newData: Json | null): AuditFieldChange[] {
  const previous = fields(oldData);
  const current = fields(newData);
  const keys = [...new Set([...Object.keys(previous), ...Object.keys(current)])].sort();
  return keys.flatMap((field) => {
    const before = describe(previous[field]);
    const after = describe(current[field]);
    return before === after ? [] : [{ field, before, after }];
  });
}
