import "server-only";
import { notFound } from "next/navigation";
import { uuidSchema } from "@nognog/domain";
import { createClient } from "@/lib/supabase/server";
import { readAllPages } from "@/lib/data/read-all-pages";
import { safeSearchTerm } from "@/lib/data/search";

const PAGE_SIZE = 20;

export async function getSupplierQuotationLines(page: number, query: string, materialId?: string) {
  const currentPage = Math.max(1, Math.min(10000, Number.isSafeInteger(page) ? page : 1));
  const supabase = await createClient();
  const { data, error } = await supabase.rpc("list_supplier_quotation_lines", {
    p_search: safeSearchTerm(query), p_material_id: materialId ?? null,
    p_offset: (currentPage - 1) * PAGE_SIZE, p_limit: PAGE_SIZE,
  });
  if (error) throw new Error("Unable to load supplier quotations.", { cause: error });
  const rows = data ?? [];
  const count = Number(rows[0]?.total_count ?? 0);
  return { rows, count, page: currentPage, pageCount: Math.max(1, Math.ceil(count / PAGE_SIZE)) };
}

export async function getSupplierQuotation(id: string) {
  if (!uuidSchema.safeParse(id).success) notFound();
  const supabase = await createClient();
  const { data: quote, error } = await supabase.from("supplier_quotations").select("*").eq("id", id).maybeSingle();
  if (error) throw new Error("Unable to load the supplier quotation.", { cause: error });
  if (!quote) notFound();
  const lines = await readAllPages((from, to) => supabase.from("supplier_quotation_lines")
    .select("material_id,unit_of_measure_id,quantity,unit_price").eq("quotation_id", id).order("material_id").range(from, to), "quotation lines");
  return { quote, lines };
}

export async function getPurchaseSourceRequest(id: string) {
  if (!uuidSchema.safeParse(id).success) notFound();
  const supabase = await createClient();
  const { data: request, error } = await supabase.from("material_requests")
    .select("id,request_number,source_warehouse_id,status").eq("id", id).maybeSingle();
  if (error) throw new Error("Unable to load the linked material request.", { cause: error });
  if (!request || (request.status !== "approved" && request.status !== "partially_approved")) notFound();
  const lines = await readAllPages((from, to) => supabase.from("material_request_lines")
    .select("material_id,requested_quantity").eq("request_id", id).order("material_id").range(from, to), "request materials");
  return { request, lines };
}

export async function getPurchaseSourceReport(id: string) {
  if (!uuidSchema.safeParse(id).success) notFound();
  const supabase = await createClient();
  const { data, error } = await supabase.from("material_sourcing_requests")
    .select("id,material_name,requested_quantity,source_warehouse_id,status")
    .eq("id", id).maybeSingle();
  if (error) throw new Error("Unable to load the out-of-stock report.", { cause: error });
  if (!data || data.status !== "submitted") notFound();
  const [contexts, links] = await Promise.all([
    supabase.from("purchase_procurement_context").select("sourcing_material_id").eq("material_sourcing_request_id", id),
    supabase.from("material_sourcing_request_links").select("material_id").eq("material_sourcing_request_id", id),
  ]);
  if (contexts.error || links.error) throw new Error("Unable to verify the report's catalog material.");
  const linkedMaterials = [...new Set([
    ...(contexts.data ?? []).map((item) => item.sourcing_material_id),
    ...(links.data ?? []).map((item) => item.material_id),
  ].filter((value): value is string => Boolean(value)))];
  if (linkedMaterials.length > 1) throw new Error("The report has conflicting material links.");
  return { ...data, linkedMaterialId: linkedMaterials[0] ?? null };
}

export async function getOpenPurchaseInspections(lineIds: string[]) {
  if (!lineIds.length) return [];
  const supabase = await createClient();
  const batches = await Promise.all(Array.from({ length: Math.ceil(lineIds.length / 100) }, (_, index) =>
    supabase.rpc("get_open_purchase_inspections", { p_line_ids: lineIds.slice(index * 100, index * 100 + 100) })));
  const failure = batches.find((batch) => batch.error);
  if (failure?.error) throw new Error("Unable to load purchase inspections.", { cause: failure.error });
  return batches.flatMap((batch) => batch.data ?? []);
}
