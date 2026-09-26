"use server";
import { uuidSchema } from "@nognog/domain";
import { requireUser } from "@/lib/auth";
import { pageNumber } from "@/lib/data/pagination";
import { createClient } from "@/lib/supabase/server";
export type ReferenceChoice = { value: string; label: string; unitId?: string | null; availableQuantity?: number };
export async function searchReferenceChoices(kind: "material" | "attendance" | "site_material", projectId: string, search: string, requestedPage: number): Promise<{ choices: ReferenceChoice[]; count: number }> {
  const user = await requireUser();
  if (search.length > 100 || !["material", "attendance", "site_material"].includes(kind)) throw new Error("Invalid reference search.");
  if (kind === "attendance" && (!uuidSchema.safeParse(projectId).success || (!user.canManage && !user.roles.includes("foreman")))) throw new Error("Not authorized for attendance.");
  const db = await createClient();
  const args = { p_search: search.trim(), p_offset: (pageNumber(requestedPage) - 1) * 20, p_limit: 20 };
  if (kind === "site_material") {
    if (!uuidSchema.safeParse(projectId).success) return { choices: [], count: 0 };
    const { data, error } = await db.rpc("search_site_material_choices", { ...args, p_location_id: projectId });
    if (error) throw new Error("Unable to search site stock.");
    return { choices: data.map((r) => ({ value: r.id, label: r.label, unitId: r.unit_id, availableQuantity: r.available_quantity })), count: data[0]?.total_count ?? 0 };
  }
  const result = kind === "material" ? await db.rpc("search_material_choices", args) : await db.rpc("search_attendance_assignment_choices", { ...args, p_project_id: projectId });
  if (result.error) throw new Error("Unable to search permitted records.");
  return { choices: result.data.map((r) => ({ value: r.id, label: r.label, unitId: r.unit_id })), count: result.data[0]?.total_count ?? 0 };
}
