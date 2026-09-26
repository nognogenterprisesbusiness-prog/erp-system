import "server-only";
import { notFound } from "next/navigation";
import { uuidSchema } from "@nognog/domain";
import { createClient } from "@/lib/supabase/server";
import { safeSearchTerm } from "@/lib/data/search";
import { readAllPages, readByIds } from "@/lib/data/read-all-pages";
import type { SupplierPriceRow } from "@/types/database";

const PAGE_SIZE = 20;

export async function getPurchaseOrders({ page = 1, query = "" }: { page?: number; query?: string } = {}) {
  const supabase = await createClient();
  const currentPage = Math.max(1, Math.min(10000, Number.isSafeInteger(page) ? page : 1));
  const from = (currentPage - 1) * PAGE_SIZE;
  let request = supabase.from("purchase_orders").select("id,po_number,supplier_name,warehouse_code,warehouse_name,ordered_on,expected_on,status,created_at", { count: "exact" });
  const search = safeSearchTerm(query);
  if (search) request = request.or(`po_number.ilike.%${search}%,supplier_name.ilike.%${search}%,warehouse_name.ilike.%${search}%`);
  const { data, count, error } = await request.order("created_at", { ascending: false }).order("id").range(from, from + PAGE_SIZE - 1);
  if (error) throw new Error("Unable to load purchase orders.");
  return { rows: data ?? [], count: count ?? 0, page: currentPage, pageCount: Math.max(1, Math.ceil((count ?? 0) / PAGE_SIZE)) };
}

export async function getPurchaseOrder(id: string) {
  if (!uuidSchema.safeParse(id).success) notFound();
  const supabase = await createClient();
  const { data: order, error } = await supabase.from("purchase_orders").select("*").eq("id", id).maybeSingle();
  if (error) throw new Error(`Unable to load purchase order: ${error.message}`, { cause: error });
  if (!order) notFound();
  const [linesResult, receiptsResult] = await Promise.all([
    readAllPages((from, to) => supabase.from("purchase_order_lines").select("*").eq("purchase_order_id", id).order("material_code").order("id").range(from, to), "purchase order lines"),
    readAllPages((from, to) => supabase.from("purchase_order_receipts").select("id,purchase_order_id,purchase_order_line_id,inventory_transaction_id,quantity,goods_total_cost,expected_total_cost,cost_variance_reason,delivery_reference,received_on,received_by,created_at").eq("purchase_order_id", id).order("created_at", { ascending: false }).order("id").range(from, to), "purchase receipts"),
  ]);
  return { order, lines: linesResult, receipts: receiptsResult };
}

export async function getPurchaseOrderChoices() {
  const supabase = await createClient();
  const [suppliersResult, warehousesResult, catalogResult, materialsResult] = await Promise.all([
    readAllPages((from, to) => supabase.from("suppliers").select("id,code,supplier_name").eq("status", "active").is("archived_at", null).order("supplier_name").order("id").range(from, to), "purchase suppliers"),
    readAllPages((from, to) => supabase.from("warehouses").select("id,code,name").eq("status", "active").order("code").order("id").range(from, to), "purchase warehouses"),
    readAllPages((from, to) => supabase.from("supplier_materials").select("id,supplier_id,material_id,minimum_order_quantity,availability_status").is("archived_at", null).in("availability_status", ["available", "limited"]).order("id").range(from, to), "purchase supplier catalog"),
    readAllPages((from, to) => supabase.from("materials").select("id,code,name,material_kind,is_active,archived_at").eq("material_kind", "consumable").eq("is_active", true).is("archived_at", null).order("id").range(from, to), "purchase materials"),
  ]);
  const prices: Array<Pick<SupplierPriceRow, "supplier_material_id" | "unit_price" | "effective_start_date" | "effective_end_date" | "created_at">> = await readByIds(catalogResult.map((item) => item.id), (ids, from, to) => supabase.from("supplier_prices").select("supplier_material_id,unit_price,effective_start_date,effective_end_date,created_at").in("supplier_material_id", ids).eq("currency", "PHP").order("effective_start_date", { ascending: false }).order("created_at", { ascending: false }).order("id").range(from, to), "supplier price previews");
  const materials = new Map(materialsResult.map((item) => [item.id, item]));
  return {
    suppliers: suppliersResult, warehouses: warehousesResult,
    prices,
    catalog: catalogResult.flatMap((item) => {
      const material = materials.get(item.material_id);
      return material ? [{ id: item.id, supplierId: item.supplier_id, materialId: item.material_id, code: material.code, name: material.name, minimumQuantity: item.minimum_order_quantity }] : [];
    }),
  };
}
