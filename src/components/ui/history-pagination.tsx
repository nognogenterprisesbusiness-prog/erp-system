import { IntentLink } from "@/components/layout/intent-link";
import { Button } from "./button";
export function HistoryPagination({ path, page, count, pageSize = 20, parameter = "page", filters = {} }: { path: string; page: number; count: number; pageSize?: number; parameter?: string; filters?: Record<string, string> }) {
  const pages = Math.max(1, Math.ceil(count / pageSize));
  const recordLabel = count === 1 ? "record" : "records";
  const href = (next: number) => { const params = new URLSearchParams(filters); params.set(parameter, String(next)); return `${path}?${params}`; };
  return <div className="mt-4 flex items-center justify-between gap-3 text-xs text-slate-500"><span>{count.toLocaleString()} {recordLabel} · Page {page} of {pages}</span><div className="flex gap-2">{page > 1 && <Button variant="outline" size="sm" asChild><IntentLink href={href(page - 1)}>Previous</IntentLink></Button>}{page < pages && <Button variant="outline" size="sm" asChild><IntentLink href={href(page + 1)}>Next</IntentLink></Button>}</div></div>;
}
