import "server-only";
import { notFound } from "next/navigation";
import { uuidSchema } from "@nognog/domain";
import { createClient } from "@/lib/supabase/server";
import { readAllPages, readByIds } from "@/lib/data/read-all-pages";
import type { SitePurchaseStatus } from "@/types/database";

const PAGE_SIZE = 20;
const lineTotal = (quantity: number, unitPrice: number) => Math.round(Number(quantity) * Number(unitPrice) * 100) / 100;

// Names and totals for a set of purchases (table policies decide which rows are visible).
async function describe(rows: { id: string; project_id: string; project_site_id: string; submitted_by: string }[]) {
  const supabase = await createClient();
  const [lines, projects, sites, people] = await Promise.all([
    readByIds(rows.map((row) => row.id), (ids, from, to) => supabase.from("site_purchase_lines").select("id,site_purchase_id,quantity,unit_price").in("site_purchase_id", ids).order("id").range(from, to), "site purchase lines"),
    readByIds([...new Set(rows.map((row) => row.project_id))], (ids, from, to) => supabase.from("projects").select("id,code,name").in("id", ids).order("id").range(from, to), "site purchase projects"),
    readByIds([...new Set(rows.map((row) => row.project_site_id))], (ids, from, to) => supabase.from("project_sites").select("id,name").in("id", ids).order("id").range(from, to), "site purchase sites"),
    readByIds([...new Set(rows.map((row) => row.submitted_by))], (ids, from, to) => supabase.from("profiles").select("id,full_name").in("id", ids).order("id").range(from, to), "site purchase submitters"),
  ]);
  const totals = new Map<string, number>();
  for (const line of lines) totals.set(line.site_purchase_id, (totals.get(line.site_purchase_id) ?? 0) + lineTotal(line.quantity, line.unit_price));
  const projectMap = new Map(projects.map((project) => [project.id, project]));
  const siteMap = new Map(sites.map((site) => [site.id, site.name]));
  const peopleMap = new Map(people.map((person) => [person.id, person.full_name]));
  return { totals, projectMap, siteMap, peopleMap };
}

export async function getSitePurchases({ status, page = 1 }: { status: SitePurchaseStatus; page?: number }) {
  const supabase = await createClient();
  const currentPage = Math.max(1, Math.min(10000, Number.isSafeInteger(page) ? page : 1));
  const from = (currentPage - 1) * PAGE_SIZE;
  const { data, count, error } = await supabase.from("site_purchases")
    .select("id,purchase_number,project_id,project_site_id,supplier_name,receipt_number,receipt_date,paid_with,status,submitted_by,reimbursed_on,created_at", { count: "exact" })
    .eq("status", status).order("created_at", { ascending: false }).order("id").range(from, from + PAGE_SIZE - 1);
  if (error) throw new Error("Unable to load site purchases.", { cause: error });
  const rows = data ?? [];
  const names = await describe(rows);
  return {
    rows: rows.map((row) => ({ ...row, total: names.totals.get(row.id) ?? 0, project: names.projectMap.get(row.project_id) ?? null, siteName: names.siteMap.get(row.project_site_id) ?? "", submittedByName: names.peopleMap.get(row.submitted_by) ?? "" })),
    count: count ?? 0, page: currentPage, pageCount: Math.max(1, Math.ceil((count ?? 0) / PAGE_SIZE)),
  };
}

export async function getSitePurchase(id: string) {
  if (!uuidSchema.safeParse(id).success) notFound();
  const supabase = await createClient();
  const { data: purchase, error } = await supabase.from("site_purchases").select("*").eq("id", id).maybeSingle();
  if (error) throw new Error("Unable to load the site purchase.", { cause: error });
  if (!purchase) notFound();
  const lines = await readAllPages((from, to) => supabase.from("site_purchase_lines").select("id,material_id,material_code,material_name,unit_symbol,quantity,unit_price,inventory_transaction_id").eq("site_purchase_id", id).order("material_name").order("id").range(from, to), "site purchase lines");
  const { data: stockLocation, error: stockLocationError } = await supabase.from("inventory_locations")
    .select("id").eq("project_site_id", purchase.project_site_id).maybeSingle();
  if (stockLocationError) throw new Error("Unable to load the purchase stock location.", { cause: stockLocationError });
  const names = await describe([purchase]);
  const deciderIds = [purchase.decided_by, purchase.reimbursed_by].filter((value): value is string => Boolean(value));
  const { data: deciders } = deciderIds.length ? await supabase.from("profiles").select("id,full_name").in("id", deciderIds) : { data: [] };
  const deciderNames = new Map((deciders ?? []).map((person) => [person.id, person.full_name]));
  return {
    purchase, lines: lines.map((line) => ({ ...line, total: lineTotal(line.quantity, line.unit_price) })),
    total: names.totals.get(purchase.id) ?? 0, project: names.projectMap.get(purchase.project_id) ?? null,
    siteName: names.siteMap.get(purchase.project_site_id) ?? "", stockLocationId: stockLocation?.id ?? null,
    submittedByName: names.peopleMap.get(purchase.submitted_by) ?? "",
    decidedByName: purchase.decided_by ? deciderNames.get(purchase.decided_by) ?? "" : "",
    reimbursedByName: purchase.reimbursed_by ? deciderNames.get(purchase.reimbursed_by) ?? "" : "",
  };
}

// Sites the user can buy for (Admin: every active site; Engineer: sites they
// run or projects they are assigned to as Engineer), materials and stores.
export async function getSitePurchaseChoices(userId: string, isAdmin: boolean) {
  const supabase = await createClient();
  const [sites, projects, assignments, materials, units, suppliers] = await Promise.all([
    readAllPages((from, to) => supabase.from("project_sites").select("id,name,project_id,engineer_id").eq("status", "active").order("name").order("id").range(from, to), "purchase sites"),
    readAllPages((from, to) => supabase.from("projects").select("id,code,name,status,archived_at").eq("status", "active").is("archived_at", null).order("name").order("id").range(from, to), "purchase projects"),
    isAdmin ? Promise.resolve([]) : readAllPages((from, to) => supabase.from("project_assignments").select("id,project_id").eq("user_id", userId).eq("status", "active").eq("assignment_role", "engineer").order("id").range(from, to), "engineer assignments"),
    readAllPages((from, to) => supabase.from("materials").select("id,code,name,base_unit_id").eq("material_kind", "consumable").eq("is_active", true).is("archived_at", null).order("name").order("id").range(from, to), "purchase materials"),
    readAllPages((from, to) => supabase.from("units_of_measure").select("id,symbol").order("id").range(from, to), "purchase units"),
    supabase.rpc("get_site_purchase_suppliers"),
  ]);
  if (suppliers.error) throw new Error("Unable to load stores.", { cause: suppliers.error });
  const projectMap = new Map(projects.map((project) => [project.id, project]));
  const assignedProjects = new Set(assignments.map((assignment) => assignment.project_id));
  const unitSymbols = new Map(units.map((unit) => [unit.id, unit.symbol]));
  return {
    sites: sites.filter((site) => projectMap.has(site.project_id) && (isAdmin || site.engineer_id === userId || assignedProjects.has(site.project_id)))
      .map((site) => ({ id: site.id, projectId: site.project_id, label: `${projectMap.get(site.project_id)?.name ?? ""} · ${site.name}` })),
    materials: materials.map((material) => ({ id: material.id, name: material.name, unitSymbol: unitSymbols.get(material.base_unit_id) ?? "" })),
    suppliers: suppliers.data ?? [],
  };
}

export async function countSitePurchasesWaiting() {
  const supabase = await createClient();
  const { count } = await supabase.from("site_purchases").select("id", { count: "exact", head: true }).eq("status", "submitted");
  return count ?? 0;
}
