import "server-only";
import { notFound } from "next/navigation";
import { uuidSchema } from "@nognog/domain";
import { createClient } from "@/lib/supabase/server";
import { safeSearchTerm } from "@/lib/data/search";
import { readAllPages, readByIds } from "@/lib/data/read-all-pages";

const PAGE_SIZE = 20;

// Every purchased item (purchase orders and site purchases), newest first.
export async function getPurchaseLines({ page = 1, query = "" }: { page?: number; query?: string } = {}) {
  const supabase = await createClient();
  const currentPage = Math.max(1, Math.min(10000, Number.isSafeInteger(page) ? page : 1));
  const { data, error } = await supabase.rpc("get_purchase_lines", { p_search: safeSearchTerm(query), p_offset: (currentPage - 1) * PAGE_SIZE, p_limit: PAGE_SIZE });
  if (error) throw new Error("Unable to load purchases.", { cause: error });
  const rows = data ?? [];
  const count = Number(rows[0]?.total_count ?? 0);
  return { rows, count, page: currentPage, pageCount: Math.max(1, Math.ceil(count / PAGE_SIZE)) };
}

export async function getPurchaseSummary() {
  const supabase = await createClient();
  const { data, error } = await supabase.rpc("get_purchase_summary");
  if (error) throw new Error("Unable to load purchase totals.", { cause: error });
  const row = data?.[0];
  return { items: Number(row?.item_count ?? 0), totalValue: Number(row?.total_value ?? 0), suppliers: Number(row?.supplier_count ?? 0), received: Number(row?.received_count ?? 0), unpaid: Number(row?.unpaid_value ?? 0) };
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
  const correctionIds = receiptsResult.map((r) => r.inventory_transaction_id);
  const corrections = await readByIds(correctionIds, (ids, from, to) => supabase.from("inventory_corrections").select("original_transaction_id,reason").in("original_transaction_id", ids).order("original_transaction_id").range(from, to), "receipt corrections");
  const reasons = new Map(corrections.map((c) => [c.original_transaction_id, c.reason]));
  return { order, lines: linesResult, receipts: receiptsResult.map((r) => ({ ...r, correctionReason: reasons.get(r.inventory_transaction_id) })) };
}

export async function getPurchaseOrderChoices() {
  const supabase = await createClient();
  const [suppliers, warehouses, materials, units, catalog] = await Promise.all([
    readAllPages((from, to) => supabase.from("suppliers").select("id,code,supplier_name").eq("status", "active").is("archived_at", null).order("supplier_name").order("id").range(from, to), "purchase suppliers"),
    readAllPages((from, to) => supabase.from("warehouses").select("id,code,name").eq("status", "active").order("code").order("id").range(from, to), "purchase warehouses"),
    readAllPages((from, to) => supabase.from("materials").select("id,code,name,base_unit_id").eq("material_kind", "consumable").eq("is_active", true).is("archived_at", null).order("name").order("id").range(from, to), "purchase materials"),
    readAllPages((from, to) => supabase.from("units_of_measure").select("id,symbol").order("id").range(from, to), "purchase units"),
    readAllPages((from, to) => supabase.from("supplier_materials").select("id,supplier_id,material_id").is("archived_at", null).order("id").range(from, to), "supplier materials"),
  ]);
  // Current price per supplier material; used to prefill the price field.
  const openPrices = await readByIds(catalog.map((item) => item.id), (ids, from, to) => supabase.from("supplier_prices").select("id,supplier_material_id,unit_price").in("supplier_material_id", ids).is("effective_end_date", null).eq("currency", "PHP").order("id").range(from, to), "latest supplier prices");
  const priceByCatalog = new Map(openPrices.map((price) => [price.supplier_material_id, Number(price.unit_price)]));
  const unitSymbols = new Map(units.map((unit) => [unit.id, unit.symbol]));
  const latestPrices: Record<string, number> = {};
  for (const item of catalog) {
    const price = priceByCatalog.get(item.id);
    if (price !== undefined) latestPrices[`${item.supplier_id}:${item.material_id}`] = price;
  }
  return {
    suppliers, warehouses, latestPrices,
    materials: materials.map((material) => ({ id: material.id, code: material.code, name: material.name, unitSymbol: unitSymbols.get(material.base_unit_id) ?? "" })),
  };
}

// Total, paid and balance of one purchase order, with its payments (newest first).
export async function getPurchaseOrderPayments(orderId: string) {
  const supabase = await createClient();
  const [summary, payments] = await Promise.all([
    supabase.rpc("get_purchase_order_payment_summaries", { p_order_ids: [orderId] }),
    readAllPages((from, to) => supabase.from("supplier_payments").select("id,method,bank_name,check_number,amount,payment_date,remarks,recorded_by,created_at").eq("purchase_order_id", orderId).order("payment_date", { ascending: false }).order("id").range(from, to), "supplier payments"),
  ]);
  if (summary.error?.code === "PGRST202") return null;
  if (summary.error) throw new Error("Unable to load supplier payments.", { cause: summary.error });
  const ids = payments.map((payment) => payment.id);
  const voids = await readByIds(ids, (batch, from, to) => supabase.from("supplier_payment_voids").select("id,payment_id,reason").in("payment_id", batch).order("id").range(from, to), "supplier payment voids");
  const recorders = [...new Set(payments.map((payment) => payment.recorded_by))];
  const { data: people } = recorders.length ? await supabase.from("profiles").select("id,full_name").in("id", recorders) : { data: [] };
  const voidReasons = new Map(voids.map((item) => [item.payment_id, item.reason]));
  const names = new Map((people ?? []).map((person) => [person.id, person.full_name]));
  const totals = summary.data?.[0];
  return {
    total: Number(totals?.order_total ?? 0), paid: Number(totals?.paid ?? 0), balance: Number(totals?.balance ?? 0),
    payments: payments.map((payment) => ({ ...payment, voidReason: voidReasons.get(payment.id) ?? null, recordedByName: names.get(payment.recorded_by) ?? null })),
  };
}

// Payment history for one supplier, like the client's "Supplier History" sheet.
export async function getSupplierPayments(supplierId: string, page = 1) {
  const supabase = await createClient();
  const currentPage = Math.max(1, Math.min(10000, Number.isSafeInteger(page) ? page : 1));
  const from = (currentPage - 1) * PAGE_SIZE;
  const { data, count, error } = await supabase.from("supplier_payments").select("id,purchase_order_id,method,bank_name,check_number,amount,payment_date", { count: "exact" })
    .eq("supplier_id", supplierId).order("payment_date", { ascending: false }).order("id").range(from, from + PAGE_SIZE - 1);
  if (error?.code === "42P01" || error?.code === "PGRST205") return null;
  if (error) throw new Error("Unable to load supplier payment history.", { cause: error });
  const rows = data ?? [];
  const orderIds = [...new Set(rows.map((row) => row.purchase_order_id))];
  const [orders, voids] = await Promise.all([
    readByIds(orderIds, (batch, f, t) => supabase.from("purchase_orders").select("id,po_number").in("id", batch).order("id").range(f, t), "payment orders"),
    readByIds(rows.map((row) => row.id), (batch, f, t) => supabase.from("supplier_payment_voids").select("id,payment_id").in("payment_id", batch).order("id").range(f, t), "payment voids"),
  ]);
  const numbers = new Map(orders.map((order) => [order.id, order.po_number]));
  const voided = new Set(voids.map((item) => item.payment_id));
  return { rows: rows.map((row) => ({ ...row, poNumber: numbers.get(row.purchase_order_id) ?? "", voided: voided.has(row.id) })), count: count ?? 0, page: currentPage, pageCount: Math.max(1, Math.ceil((count ?? 0) / PAGE_SIZE)) };
}
