import "server-only";
import { notFound } from "next/navigation";
import { uuidSchema } from "@nognog/domain";
import { createClient } from "@/lib/supabase/server";
import { safeSearchTerm } from "@/lib/data/search";

const PAGE_SIZE = 20;

export async function getInvoices({ page = 1, query = "" }: { page?: number; query?: string } = {}) {
  const supabase = await createClient();
  const currentPage = Math.max(1, Math.min(10000, page));
  const from = (currentPage - 1) * PAGE_SIZE;
  let request = supabase.from("client_invoices").select("id,invoice_number,project_id,project_code,project_name,client_name,description,issued_on,due_on,amount,status,created_at", { count: "exact" });
  const search = safeSearchTerm(query);
  if (search) request = request.or(`invoice_number.ilike.%${search}%,client_name.ilike.%${search}%,description.ilike.%${search}%`);
  const { data, count, error } = await request.order("created_at", { ascending: false }).range(from, from + PAGE_SIZE - 1);
  if (error) throw new Error(`Unable to load invoices: ${error.message}`);
  const invoices = data ?? [];
  const ids = invoices.map((invoice) => invoice.id);
  const balancesResult = ids.length ? await supabase.rpc("get_client_invoice_balances", { p_invoice_ids: ids }) : { data: [], error: null };
  if (balancesResult.error) throw new Error("Unable to load invoice balances.");
  const balances = new Map((balancesResult.data ?? []).map((row) => [row.invoice_id, row]));
  return { rows: invoices.map((invoice) => ({ ...invoice, balance: balances.get(invoice.id) })), count: count ?? 0, page: currentPage, pageCount: Math.max(1, Math.ceil((count ?? 0) / PAGE_SIZE)) };
}

export async function getInvoice(id: string) {
  if (!uuidSchema.safeParse(id).success) notFound();
  const supabase = await createClient();
  const { data: invoice, error } = await supabase.from("client_invoices").select("*").eq("id", id).maybeSingle();
  if (error) throw new Error(`Unable to load invoice: ${error.message}`, { cause: error });
  if (!invoice) notFound();
  const [paymentsResult, balanceResult] = await Promise.all([
    supabase.from("client_payments").select("id,invoice_id,amount,paid_on,reference,recorded_by,created_at").eq("invoice_id", id).order("created_at", { ascending: false }),
    supabase.rpc("get_client_invoice_balances", { p_invoice_ids: [id] }),
  ]);
  if (paymentsResult.error || balanceResult.error) throw new Error("Unable to load invoice details.");
  const payments = paymentsResult.data ?? [];
  const paymentIds = payments.map((payment) => payment.id);
  const reversalsResult = paymentIds.length
    ? await supabase.from("client_payment_reversals").select("payment_id,reason,reversed_at,reversed_by").in("payment_id", paymentIds)
    : { data: [], error: null };
  if (reversalsResult.error) throw new Error("Unable to load payment corrections.");
  const reversals = new Map((reversalsResult.data ?? []).map((row) => [row.payment_id, row]));
  return { invoice, balance: balanceResult.data?.[0], payments: payments.map((payment) => ({ ...payment, reversal: reversals.get(payment.id) })) };
}

export async function getBillableProjects() {
  const supabase = await createClient();
  const { data, error } = await supabase.rpc("get_billable_projects");
  if (error) throw new Error("Unable to load billable projects.");
  return data ?? [];
}
