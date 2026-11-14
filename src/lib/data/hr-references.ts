import "server-only";
import { createClient } from "@/lib/supabase/server";
import { readAllPages, readByIds } from "./read-all-pages";

/** Narrow workforce labels; HR never receives complete project or account rows. */
export async function getHrReferences(kind: "project" | "site" | "actor", ids?: string[], projectId?: string) {
  const client = await createClient();
  const read = (selected: string[] | undefined, from: number, to: number) => client.rpc("get_hr_workforce_references", {
    p_kind: kind, p_ids: selected ?? null, p_project_id: projectId ?? null, p_offset: from, p_limit: to - from + 1,
  });
  return ids ? readByIds(ids, read, "workforce references") : readAllPages((from, to) => read(undefined, from, to), "workforce references");
}
