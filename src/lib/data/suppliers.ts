import "server-only";
import { notFound } from "next/navigation";
import { uuidSchema } from "@nognog/domain";
import { createClient } from "@/lib/supabase/server";
import { safeSearchTerm } from "./search";
import { readAllPages, readByIds } from "./read-all-pages";
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

export async function getSupplierReferences() {
  const supabase = await createClient();
  const [materials, units] = await Promise.all([
    readAllPages((from, to) => supabase.from("materials").select("id,code,name,base_unit_id,material_kind,is_active,archived_at").eq("is_active", true).is("archived_at", null).order("name").order("id").range(from, to), "supplier material choices"),
    readAllPages((from, to) => supabase.from("units_of_measure").select("id,code,name,symbol,dimension,decimal_scale,is_active,created_at").eq("is_active", true).order("name").order("id").range(from, to), "supplier units"),
  ]);
  return { materials, units };
}

export type SupplierListView = SupplierRow & { catalogCount: number };
export async function getSuppliers(params: { query?: string; status?: SupplierStatus | "archived" | "all"; page?: number } = {}) {
  const supabase = await createClient();
  const requestedPage = Number.isSafeInteger(params.page) ? params.page! : 1;
  const page = Math.min(10_000, Math.max(1, requestedPage));
  const from = (page - 1) * PAGE_SIZE;
  let request = supabase.from("suppliers").select("*", { count: "exact" });
  const search = safeSearchTerm(params.query);
  if (search) request = request.or(`code.ilike.%${search}%,supplier_name.ilike.%${search}%,business_name.ilike.%${search}%,contact_person.ilike.%${search}%`);
  if (params.status === "archived") request = request.not("archived_at", "is", null);
  else {
    request = request.is("archived_at", null);
    if (params.status && params.status !== "all") request = request.eq("status", params.status);
  }
  const { data: suppliers, count, error } = await request.order("supplier_name").range(from, from + PAGE_SIZE - 1);
  if (error) throw new Error("Unable to load suppliers.");
  const ids = (suppliers ?? []).map((supplier) => supplier.id);
  const catalog = await readByIds(ids, (batch, from, to) => supabase.from("supplier_materials").select("id,supplier_id").in("supplier_id", batch).is("archived_at", null).order("id").range(from, to), "supplier catalog counts");
  const counts = new Map<string, number>();
  for (const item of catalog) counts.set(item.supplier_id, (counts.get(item.supplier_id) ?? 0) + 1);
  return {
    suppliers: (suppliers ?? []).map((supplier): SupplierListView => ({ ...supplier, catalogCount: counts.get(supplier.id) ?? 0 })),
    count: count ?? 0,
    page,
    pageCount: Math.max(1, Math.ceil((count ?? 0) / PAGE_SIZE)),
  };
}

export async function getSupplier(id: string, pages = { events: 1, purchases: 1, prices: 1 }) {
  if (!uuidSchema.safeParse(id).success) notFound();
  const supabase = await createClient();
  const { data: supplier, error } = await supabase.from("suppliers").select("*").eq("id", id).maybeSingle();
  if (error) throw new Error(`Unable to load supplier: ${error.message}`, { cause: error });
  if (!supplier) notFound();
  const [catalogResult, eventResult, purchaseResult, references] = await Promise.all([
    readAllPages((from, to) => supabase.from("supplier_materials").select("*").eq("supplier_id", id).order("updated_at", { ascending: false }).order("id").range(from, to), "supplier catalog"),
    supabase.from("supplier_events").select("*", { count: "exact" }).eq("supplier_id", id).order("occurred_at", { ascending: false }).order("id").range((pages.events - 1) * 20, pages.events * 20 - 1),
    supabase.from("purchase_orders").select("id,po_number,warehouse_name,ordered_on,expected_on,status", { count: "exact" }).eq("supplier_id", id).order("ordered_on", { ascending: false }).order("id").range((pages.purchases - 1) * 20, pages.purchases * 20 - 1),
    getSupplierReferences(),
  ]);
  if (eventResult.error || purchaseResult.error) throw new Error("Unable to load the supplier record.");
  const purchaseIds = (purchaseResult.data ?? []).map((order) => order.id);
  const receipts = await readByIds(purchaseIds, (batch, from, to) => supabase.from("purchase_order_receipts").select("id,purchase_order_id").in("purchase_order_id", batch).order("id").range(from, to), "supplier purchase receipts");
  const receiptCounts = new Map<string, number>();
  for (const receipt of receipts) receiptCounts.set(receipt.purchase_order_id, (receiptCounts.get(receipt.purchase_order_id) ?? 0) + 1);
  const catalog = catalogResult;
  const [summaryPrices, historyPrices] = await Promise.all([
    supabase.rpc("list_supplier_summary_prices", { p_supplier_id: id, p_as_of: todayInManila() }),
    supabase.rpc("list_supplier_price_history", { p_supplier_id: id, p_offset: (pages.prices - 1) * 20, p_limit: 20 }),
  ]);
  if (summaryPrices.error || historyPrices.error) throw new Error("Unable to load supplier price history.");
  const history = (historyPrices.data ?? []).map((p) => p.record as SupplierPriceRow);
  const prices = [...(summaryPrices.data ?? []), ...history];
  const actorIds = [...new Set([...(eventResult.data ?? []).map((event) => event.actor_id), ...(prices ?? []).map((price) => price.recorded_by)])];
  const { data: actors } = actorIds.length ? await supabase.from("profiles").select("id,full_name").in("id", actorIds) : { data: [] };
  const actorMap = new Map((actors ?? []).map((actor) => [actor.id, actor.full_name]));
  const materialMap = new Map(references.materials.map((material) => [material.id, material]));
  const unitMap = new Map(references.units.map((unit) => [unit.id, unit]));
  const pricesByCatalog = new Map<string, SupplierPriceRow[]>();
  for (const price of prices ?? []) pricesByCatalog.set(price.supplier_material_id, [...(pricesByCatalog.get(price.supplier_material_id) ?? []), price]);
  return {
    historyCounts: { events: eventResult.count ?? 0, prices: historyPrices.data?.[0]?.total_count ?? 0 },
    supplier,
    catalog: catalog.map((item) => ({
      ...item,
      material: materialMap.get(item.material_id),
      unit: unitMap.get(item.unit_of_measure_id),
      prices: { ...resolvePrices(pricesByCatalog.get(item.id) ?? []), history: history.filter((price) => price.supplier_material_id === item.id) },
    })),
    events: (eventResult.data ?? []).map((event) => ({ ...event, actorName: actorMap.get(event.actor_id) ?? "Authorized user" })),
    priceActors: actorMap,
    purchaseOrders: (purchaseResult.data ?? []).map((order) => ({ ...order, receiptCount: receiptCounts.get(order.id) ?? 0 })),
    purchaseOrderCount: purchaseResult.count ?? 0,
    references,
  };
}

export async function getSupplierPriceComparison(params: { materialId?: string; supplierId?: string; availability?: MaterialAvailabilityStatus | "all" } = {}) {
  const supabase = await createClient();
  let request = supabase.from("supplier_materials").select("*").is("archived_at", null).order("updated_at", { ascending: false }).order("id");
  const materialId = uuidSchema.safeParse(params.materialId);
  const supplierId = uuidSchema.safeParse(params.supplierId);
  if (materialId.success) request = request.eq("material_id", materialId.data);
  if (supplierId.success) request = request.eq("supplier_id", supplierId.data);
  if (params.availability && params.availability !== "all") request = request.eq("availability_status", params.availability);
  const [catalog, references, suppliers] = await Promise.all([
    readAllPages((from, to) => request.range(from, to), "supplier price catalog"),
    getSupplierReferences(),
    readAllPages((from, to) => supabase.from("suppliers").select("id,code,supplier_name,business_name,status,archived_at").eq("status", "active").is("archived_at", null).order("supplier_name").order("id").range(from, to), "active suppliers"),
  ]);
  const activeSupplierIds = new Set(suppliers.map((supplier) => supplier.id));
  const visibleCatalog = catalog.filter((item) => activeSupplierIds.has(item.supplier_id));
  const ids = visibleCatalog.map((item) => item.id);
  const prices = await readByIds(ids, (batch, from, to) => supabase.from("supplier_prices").select("*").in("supplier_material_id", batch).order("effective_start_date", { ascending: false }).order("id").range(from, to), "supplier prices");
  const supplierMap = new Map(suppliers.map((supplier) => [supplier.id, supplier]));
  const materialMap = new Map(references.materials.map((material) => [material.id, material]));
  const unitMap = new Map(references.units.map((unit) => [unit.id, unit]));
  const pricesByCatalog = new Map<string, SupplierPriceRow[]>();
  for (const price of prices) pricesByCatalog.set(price.supplier_material_id, [...(pricesByCatalog.get(price.supplier_material_id) ?? []), price]);
  return {
    rows: visibleCatalog.map((item) => ({ ...item, supplier: supplierMap.get(item.supplier_id), material: materialMap.get(item.material_id), unit: unitMap.get(item.unit_of_measure_id), prices: resolvePrices(pricesByCatalog.get(item.id) ?? []) })),
    suppliers,
    materials: references.materials,
  };
}

export type SupplierMaterialView = SupplierMaterialRow & { unit?: UnitRow; prices: ReturnType<typeof resolvePrices> };
