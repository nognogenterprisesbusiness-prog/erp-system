export type RecordViewMode = "cards" | "table";
export type RecordViewPreferences = Readonly<Record<string, RecordViewMode>>;
export const recordViewCookie = "erp-list-views";

const validKey = (key: string) => /^[a-z][a-z0-9-]{0,63}$/.test(key) && key !== "constructor";

export function parseRecordViewPreferences(value?: string): RecordViewPreferences {
  if (!value || value.length > 3500) return {};
  try {
    const parsed: unknown = JSON.parse(decodeURIComponent(value));
    if (!parsed || typeof parsed !== "object" || Array.isArray(parsed)) return {};
    return Object.fromEntries(Object.entries(parsed).filter(([key, mode]) => validKey(key)
      && (mode === "cards" || mode === "table")).slice(0, 32)) as RecordViewPreferences;
  } catch { return {}; }
}

export function updateRecordViewPreferences(value: string | undefined, key: string, mode: RecordViewMode): string {
  if (!validKey(key)) return encodeURIComponent(JSON.stringify(parseRecordViewPreferences(value)));
  const entries = Object.entries(parseRecordViewPreferences(value)).filter(([name]) => name !== key).slice(-31);
  return encodeURIComponent(JSON.stringify(Object.fromEntries([...entries, [key, mode]])));
}
