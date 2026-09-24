import "server-only";
import { cache } from "react";
import { notFound } from "next/navigation";
import { uuidSchema } from "@nognog/domain";
import { createClient } from "@/lib/supabase/server";
import { safeSearchTerm } from "./search";
import { todayInManila } from "@/lib/date";
import type { MaterialAvailabilityStatus, SupplierMaterialRow, SupplierPriceRow, SupplierRow, SupplierStatus, UnitRow } from "@/types/database";

const PAGE_SIZE = 25;

function resolvePrices(prices: SupplierPriceRow[], asOf = todayInManila()) {
  const ordered = [...prices].sort((a, b) => b.effective_start_date.localeCompare(a.effective_start_date));
  const current = ordered.find((price) => price.effective_start_date <= asOf && (!price.effective_end_date || price.effective_end_date >= asOf));
  const previousBoundary = current?.effective_start_date ?? asOf;
  const previous = ordered.find((price) => price.id !== current?.id && price.effective_start_date < previousBoundary);
  return { current, previous, history: ordered };
}

export const getSupplierCategories = cache(async function getSupplierCategories(includeArchived = false) {
  const supabase = await createClient();
  let query = supabase.from("supplier_categories").select("id,name,description,created_by,updated_by,archived_at,archived_by,created_at,updated_at").order("name").limit(500);
  if (!includeArchived) query = query.is("archived_at", null);
  const { data, error } = await query;
  if (error) throw new Error("Unable to load supplier categories.");
  return data ?? [];
});

export async function getSupplierReferences() {
  const supabase = await createClient();
  const [categories, materialResult, unitResult] = await Promise.all([
    getSupplierCategories(false),
    supabase.from("materials").select("id,code,name,base_unit_id,material_kind,is_active,archived_at").eq("is_active", true).is("archived_at", null).order("name").limit(500),
    supabase.from("units_of_measure").select("id,code,name,symbol,dimension,decimal_scale,is_active,created_at").eq("is_active", true).order("name").limit(100),
  ]);
  if (materialResult.error || unitResult.error) throw new Error("Unable to load supplier reference data.");
  return { categories, materials: materialResult.data ?? [], units: unitResult.data ?? [] };
}

export type SupplierListView = SupplierRow & { categoryName: string; catalogCount: number };
export async function getSuppliers(params: { query?: string; categoryId?: string; status?: SupplierStatus | "archived" | "all"; page?: number } = {}) {
  const supabase = await createClient();
  const requestedPage = Number.isSafeInteger(params.page) ? params.page! : 1;
  const page = Math.min(10_000, Math.max(1, requestedPage));
  const from = (page - 1) * PAGE_SIZE;
  let request = supabase.from("suppliers").select("*", { count: "exact" });
  const search = safeSearchTerm(params.query);
  if (search) request = request.or(`code.ilike.%${search}%,supplier_name.ilike.%${search}%,business_name.ilike.%${search}%,contact_person.ilike.%${search}%`);
  const categoryId = uuidSchema.safeParse(params.categoryId);
  if (categoryId.success) request = request.eq("category_id", categoryId.data);
  if (params.status === "archived") request = request.not("archived_at", "is", null);
  else {
    request = request.is("archived_at", null);
    if (params.status && params.status !== "all") request = request.eq("status", params.status);
  }
  const { data: suppliers, count, error } = await request.order("supplier_name").range(from, from + PAGE_SIZE - 1);
  if (error) throw new Error("Unable to load suppliers.");
  const ids = (suppliers ?? []).map((supplier) => supplier.id);
  const categoryIds = [...new Set((suppliers ?? []).map((supplier) => supplier.category_id))];
  const [{ data: categories, error: categoryError }, { data: catalog, error: catalogError }] = await Promise.all([
    categoryIds.length ? supabase.from("supplier_categories").select("id,name").in("id", categoryIds) : Promise.resolve({ data: [], error: null }),
    ids.length ? supabase.from("supplier_materials").select("supplier_id").in("supplier_id", ids).is("archived_at", null) : Promise.resolve({ data: [], error: null }),
  ]);
  if (categoryError || catalogError) throw new Error("Unable to resolve supplier reference data.");
  const categoryMap = new Map((categories ?? []).map((category) => [category.id, category.name]));
  const counts = new Map<string, number>();
  for (const item of catalog ?? []) counts.set(item.supplier_id, (counts.get(item.supplier_id) ?? 0) + 1);
  return {
    suppliers: (suppliers ?? []).map((supplier): SupplierListView => ({ ...supplier, categoryName: categoryMap.get(supplier.category_id) ?? "Unavailable category", catalogCount: counts.get(supplier.id) ?? 0 })),
    count: count ?? 0,
    page,
    pageCount: Math.max(1, Math.ceil((count ?? 0) / PAGE_SIZE)),
  };
}

export async function getSupplier(id: string) {
  const supabase = await createClient();
  const { data: supplier, error } = await supabase.from("suppliers").select("*").eq("id", id).single();
  if (error || !supplier) notFound();
  const [categoryResult, catalogResult, eventResult, references] = await Promise.all([
    supabase.from("supplier_categories").select("*").eq("id", supplier.category_id).single(),
    supabase.from("supplier_materials").select("*").eq("supplier_id", id).order("updated_at", { ascending: false }),
    supabase.from("supplier_events").select("*").eq("supplier_id", id).order("occurred_at", { ascending: false }).limit(100),
    getSupplierReferences(),
  ]);
  if (categoryResult.error || catalogResult.error || eventResult.error) throw new Error("Unable to load the supplier record.");
  const catalog = catalogResult.data ?? [];
  const catalogIds = catalog.map((item) => item.id);
  const { data: prices, error: priceError } = catalogIds.length
    ? await supabase.from("supplier_prices").select("*").in("supplier_material_id", catalogIds).order("effective_start_date", { ascending: false }).limit(1000)
    : { data: [], error: null };
  if (priceError) throw new Error("Unable to load supplier price history.");
  const actorIds = [...new Set([...(eventResult.data ?? []).map((event) => event.actor_id), ...(prices ?? []).map((price) => price.recorded_by)])];
  const { data: actors } = actorIds.length ? await supabase.from("profiles").select("id,full_name").in("id", actorIds) : { data: [] };
  const actorMap = new Map((actors ?? []).map((actor) => [actor.id, actor.full_name]));
  const materialMap = new Map(references.materials.map((material) => [material.id, material]));
  const unitMap = new Map(references.units.map((unit) => [unit.id, unit]));
  const pricesByCatalog = new Map<string, SupplierPriceRow[]>();
  for (const price of prices ?? []) pricesByCatalog.set(price.supplier_material_id, [...(pricesByCatalog.get(price.supplier_material_id) ?? []), price]);
  return {
    supplier,
    category: categoryResult.data,
    catalog: catalog.map((item) => ({
      ...item,
      material: materialMap.get(item.material_id),
      unit: unitMap.get(item.unit_of_measure_id),
      prices: resolvePrices(pricesByCatalog.get(item.id) ?? []),
    })),
    events: (eventResult.data ?? []).map((event) => ({ ...event, actorName: actorMap.get(event.actor_id) ?? "Authorized user" })),
    priceActors: actorMap,
    references,
  };
}

export async function getSupplierPriceComparison(params: { materialId?: string; supplierId?: string; availability?: MaterialAvailabilityStatus | "all" } = {}) {
  const supabase = await createClient();
  let request = supabase.from("supplier_materials").select("*").is("archived_at", null).order("updated_at", { ascending: false }).limit(1000);
  const materialId = uuidSchema.safeParse(params.materialId);
  const supplierId = uuidSchema.safeParse(params.supplierId);
  if (materialId.success) request = request.eq("material_id", materialId.data);
  if (supplierId.success) request = request.eq("supplier_id", supplierId.data);
  if (params.availability && params.availability !== "all") request = request.eq("availability_status", params.availability);
  const [{ data: catalog, error }, references, supplierResult] = await Promise.all([
    request,
    getSupplierReferences(),
    supabase.from("suppliers").select("id,code,supplier_name,business_name,status,archived_at").eq("status", "active").is("archived_at", null).order("supplier_name").limit(500),
  ]);
  if (error || supplierResult.error) throw new Error("Unable to load supplier price comparison.");
  const activeSupplierIds = new Set((supplierResult.data ?? []).map((supplier) => supplier.id));
  const visibleCatalog = (catalog ?? []).filter((item) => activeSupplierIds.has(item.supplier_id));
  const ids = visibleCatalog.map((item) => item.id);
  const { data: prices, error: priceError } = ids.length
    ? await supabase.from("supplier_prices").select("*").in("supplier_material_id", ids).order("effective_start_date", { ascending: false }).limit(2000)
    : { data: [], error: null };
  if (priceError) throw new Error("Unable to load supplier prices.");
  const supplierMap = new Map((supplierResult.data ?? []).map((supplier) => [supplier.id, supplier]));
  const materialMap = new Map(references.materials.map((material) => [material.id, material]));
  const unitMap = new Map(references.units.map((unit) => [unit.id, unit]));
  const pricesByCatalog = new Map<string, SupplierPriceRow[]>();
  for (const price of prices ?? []) pricesByCatalog.set(price.supplier_material_id, [...(pricesByCatalog.get(price.supplier_material_id) ?? []), price]);
  return {
    rows: visibleCatalog.map((item) => ({ ...item, supplier: supplierMap.get(item.supplier_id), material: materialMap.get(item.material_id), unit: unitMap.get(item.unit_of_measure_id), prices: resolvePrices(pricesByCatalog.get(item.id) ?? []) })),
    suppliers: supplierResult.data ?? [],
    materials: references.materials,
  };
}

export type SupplierMaterialView = SupplierMaterialRow & { unit?: UnitRow; prices: ReturnType<typeof resolvePrices> };
