import "server-only";
import { notFound } from "next/navigation";
import { issuePurchaseOrderSchema, uuidSchema } from "@nognog/domain";
import { createClient } from "@/lib/supabase/server";

const PAGE_SIZE = 20;
const payloadId = (value: unknown, key: string) =>
  value && typeof value === "object" && !Array.isArray(value) && key in value
    ? uuidSchema.safeParse((value as Record<string, unknown>)[key]).data
    : undefined;

export async function getPendingPurchaseApprovals(page = 1) {
  const currentPage = Math.max(1, Math.min(10000, Number.isSafeInteger(page) ? page : 1));
  const from = (currentPage - 1) * PAGE_SIZE;
  const supabase = await createClient();
  const { data, count, error } = await supabase.from("purchase_approval_requests")
    .select("id,request_payload,order_total,requested_by,created_at", { count: "exact" })
    .eq("status", "pending").order("created_at", { ascending: false }).order("id")
    .range(from, from + PAGE_SIZE - 1);
  if (error) throw new Error("Unable to load purchases awaiting approval.", { cause: error });
  const rows = data ?? [];
  const supplierIds = [...new Set(rows.map((row) => payloadId(row.request_payload, "supplier")).filter((id): id is string => Boolean(id)))];
  const warehouseIds = [...new Set(rows.map((row) => payloadId(row.request_payload, "warehouse")).filter((id): id is string => Boolean(id)))];
  const [suppliers, warehouses] = await Promise.all([
    supplierIds.length ? supabase.from("suppliers").select("id,supplier_name").in("id", supplierIds) : Promise.resolve({ data: [], error: null }),
    warehouseIds.length ? supabase.from("warehouses").select("id,name").in("id", warehouseIds) : Promise.resolve({ data: [], error: null }),
  ]);
  if (suppliers.error || warehouses.error) throw new Error("Unable to load purchase approval details.");
  const supplierNames = new Map((suppliers.data ?? []).map((item) => [item.id, item.supplier_name]));
  const warehouseNames = new Map((warehouses.data ?? []).map((item) => [item.id, item.name]));
  const total = count ?? 0;
  return {
    rows: rows.map((row) => ({
      id: row.id, orderTotal: Number(row.order_total), createdAt: row.created_at,
      supplierName: supplierNames.get(payloadId(row.request_payload, "supplier") ?? "") ?? "Supplier unavailable",
      warehouseName: warehouseNames.get(payloadId(row.request_payload, "warehouse") ?? "") ?? "Warehouse unavailable",
    })),
    count: total, page: currentPage, pageCount: Math.max(1, Math.ceil(total / PAGE_SIZE)),
  };
}

export async function getPurchaseApprovalRequest(id: string) {
  if (!uuidSchema.safeParse(id).success) notFound();
  const supabase = await createClient();
  const { data: request, error } = await supabase.from("purchase_approval_requests").select("*").eq("id", id).maybeSingle();
  if (error) throw new Error("Unable to load this purchase approval.", { cause: error });
  if (!request) notFound();
  const raw = request.request_payload;
  const source = raw && typeof raw === "object" && !Array.isArray(raw) ? raw as Record<string, unknown> : {};
  const parsed = issuePurchaseOrderSchema.safeParse({
    idempotencyKey: request.idempotency_key,
    supplierId: source.supplier, warehouseId: source.warehouse,
    orderedOn: source.ordered_on, expectedOn: source.expected_on ?? "",
    purpose: source.purpose ?? "", lines: source.lines,
  });
  if (!parsed.success) throw new Error("The saved purchase details are invalid. Contact an administrator.");
  const input = parsed.data;
  const materialIds = input.lines.map((line) => line.materialId);
  const [supplier, warehouse, materials, people, context] = await Promise.all([
    supabase.from("suppliers").select("id,supplier_name").eq("id", input.supplierId).single(),
    supabase.from("warehouses").select("id,name").eq("id", input.warehouseId).single(),
    supabase.from("materials").select("id,code,name").in("id", materialIds),
    supabase.from("profiles").select("id,full_name").in("id", [request.requested_by, ...(request.decided_by ? [request.decided_by] : [])]),
    supabase.from("purchase_procurement_context").select("material_request_id,supplier_quotation_id")
      .eq("idempotency_key", request.idempotency_key).maybeSingle(),
  ]);
  if (supplier.error || warehouse.error || materials.error || people.error || context.error) throw new Error("Unable to load purchase approval details.");
  const names = new Map((materials.data ?? []).map((material) => [material.id, material]));
  const peopleNames = new Map((people.data ?? []).map((person) => [person.id, person.full_name]));
  return {
    request, input, context: context.data,
    supplierName: supplier.data.supplier_name,
    warehouseName: warehouse.data.name,
    requestedByName: peopleNames.get(request.requested_by) ?? "Unknown",
    decidedByName: request.decided_by ? peopleNames.get(request.decided_by) ?? "Unknown" : null,
    lines: input.lines.map((line) => ({ ...line, materialName: names.get(line.materialId)?.name ?? "Unavailable material", materialCode: names.get(line.materialId)?.code ?? "" })),
  };
}
