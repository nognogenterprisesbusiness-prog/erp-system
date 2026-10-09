import type { SupabaseClient } from "@supabase/supabase-js";
import type { MaterialInput } from "@nognog/domain";
import type { Database } from "@/types/database";

async function legacyCategoryReference(client: SupabaseClient<Database>, materialId?: string): Promise<string> {
  if (materialId) {
    const existing = await client.from("materials").select("category_id").eq("id", materialId).maybeSingle();
    if (existing.error || !existing.data?.category_id) throw new Error("The material is no longer available.");
    return existing.data.category_id;
  }
  const find = () => client.from("material_categories").select("id").is("archived_at", null)
    .order("created_at").order("id").limit(1).maybeSingle();
  const existing = await find();
  if (existing.error) throw new Error("Material setup could not be checked.");
  if (existing.data) return existing.data.id;
  const saved = await client.rpc("save_material_category", {
    p_id: null, p_name: "Materials", p_description: "",
  });
  if (!saved.error && saved.data) return saved.data;
  // Re-read the shared reference if another Admin initializes it first.
  if (saved.error?.code === "23505") {
    const concurrent = await find();
    if (!concurrent.error && concurrent.data) return concurrent.data.id;
  }
  throw new Error("Material setup could not be completed. Please retry.");
}

/** Support the deployed schema during a rolling migration; only missing-RPC errors select the old command. */
export async function saveMaterialCatalog(client: SupabaseClient<Database>, input: MaterialInput) {
  const args = { p_id: input.id ?? null, p_code: input.code, p_name: input.name,
    p_description: input.description || "", p_base_unit_id: input.baseUnitId,
    p_material_kind: input.materialKind, p_minimum_stock_level: input.minimumStockLevel,
    p_is_active: input.isActive === "true" };
  const result = await client.rpc("save_material_catalog", args);
  if (result.error?.code !== "PGRST202") return result;
  const categoryId = await legacyCategoryReference(client, input.id);
  return client.rpc("save_material", { ...args, p_category_id: categoryId });
}
