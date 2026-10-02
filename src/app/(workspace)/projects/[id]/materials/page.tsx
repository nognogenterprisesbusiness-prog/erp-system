import { Invoice03Icon, Money03Icon } from "@hugeicons/core-free-icons";
import { IntentLink as Link } from "@/components/layout/intent-link";
import { notFound } from "next/navigation";
import { redirect } from "next/navigation";
import { uuidSchema } from "@nognog/domain";
import { ProjectMaterialPlanForm } from "@/components/projects/project-material-plan-form";
import { RecordCreateDialog } from "@/components/ui/record-create-dialog";
import { Button } from "@/components/ui/button";
import { DataTableShell } from "@/components/ui/data-table-shell";
import { EmptyState } from "@/components/ui/empty-state";
import { MetricCard } from "@/components/ui/metric-card";
import { PageHeader } from "@/components/ui/page-header";
import { RecordActionMenu, type RecordAction } from "@/components/ui/record-action-menu";
import { tableHeadClass } from "@/components/ui/table-sort-heading";
import { createClient } from "@/lib/supabase/server";
import { requireUser } from "@/lib/auth";
import { getProject } from "@/lib/data/projects";
import { getProjectMaterialEstimate, getProjectMaterialPlan } from "@/lib/data/project-operations";
import { getProjectProfitability } from "@/lib/data/project-costs";
import { getMaterialRequestChoices } from "@/lib/data/material-requests";

const quantity = (value: number) => new Intl.NumberFormat("en-PH", { maximumFractionDigits: 4 }).format(value);
const money = (amount: number) => new Intl.NumberFormat("en-PH", { style: "currency", currency: "PHP" }).format(amount);
const priceSourceLabel = { supplier: "Latest supplier price", stock: "Next stock batch price" } as const;

export default async function ProjectMaterialsPage({ params, searchParams }: { params: Promise<{ id: string }>; searchParams: Promise<{ edit?: string }> }) {
  const { id } = await params;
  if (!uuidSchema.safeParse(id).success) notFound();
  const user = await requireUser();
  if (!user.canViewDailyReports) redirect(`/projects/${id}`);
  const [projectData, rows, estimates, profitability] = await Promise.all([
    getProject(id),
    getProjectMaterialPlan(id),
    user.canManage ? getProjectMaterialEstimate(id) : Promise.resolve(null),
    user.canManage ? getProjectProfitability(id) : Promise.resolve(null),
  ]);
  const estimatedTotal = estimates ? [...estimates.values()].reduce((sum, row) => sum + Number(row.estimated_cost ?? 0), 0) : 0;
  const unpricedCount = estimates ? rows.filter((row) => estimates.get(row.id)?.unit_cost == null).length : 0;
  const { data: reviewSites, error: reviewError } = await (await createClient()).rpc("get_project_review_sites", { p_project_id: id });
  if (reviewError) throw new Error("Unable to verify material plan access.");
  const allowedSites = new Set(reviewSites ?? []);
  const canPlan = allowedSites.size > 0;
  const canRequest = !user.canManage && user.roles.some((role) => ["engineer", "foreman"].includes(role));
  const unfilteredChoices = canPlan ? await getMaterialRequestChoices() : null;
  const choices = unfilteredChoices ? { ...unfilteredChoices, sites: unfilteredChoices.sites.filter((s) => allowedSites.has(s.id)) } : null;
  const editId = (await searchParams).edit;
  const editing = canPlan ? rows.find((row) => row.id === editId && allowedSites.has(row.project_site_id)) : undefined;
  return <>
    <PageHeader title="Material plan" description={`${projectData.project.code} · ${projectData.project.name}`} action={<div className="flex flex-wrap gap-2"><Button variant="outline" asChild><Link href={`/projects/${id}?tab=materials`}>Back to project</Link></Button>{canPlan && choices && <RecordCreateDialog key={editing?.id ?? "new"} title={editing ? "Edit material plan" : "Add material plan"} initialOpen={Boolean(editing)} closeHref={`/projects/${id}/materials`}><ProjectMaterialPlanForm projectId={id} choices={choices} initial={editing ? { siteId: editing.project_site_id, warehouseId: editing.warehouse_id, materialId: editing.material_id, quantity: String(editing.planned_quantity), requiredOn: editing.required_on, note: editing.note } : undefined} /></RecordCreateDialog>}</div>} />
    <section className="mt-7 rounded-xl border border-slate-200 bg-white p-5 sm:p-6">
      <h2 className="text-base font-semibold">Plan by site and source warehouse</h2>
      <p className="mt-1 text-sm text-slate-500">Shortage compares the plan with use so far, site stock, open requests and warehouse stock.</p>
    </section>
    {estimates && profitability && rows.length > 0 && <div className="mt-5 grid gap-3 sm:grid-cols-2">
      <MetricCard label="Estimated material cost" value={money(estimatedTotal)} detail={unpricedCount ? `${unpricedCount} material${unpricedCount === 1 ? " has" : "s have"} no supplier price or stock cost yet` : "Planned quantity × latest supplier price, else the next stock batch price"} icon={Invoice03Icon} tone="bg-cyan-50 text-cyan-700" />
      <MetricCard label="Approved budget" value={money(Number(profitability.approved_budget))} detail={`${money(Math.abs(Number(profitability.approved_budget) - estimatedTotal))} ${Number(profitability.approved_budget) >= estimatedTotal ? "left after materials" : "over budget on materials"}`} icon={Money03Icon} tone="bg-emerald-50 text-emerald-600" />
    </div>}
    <div className="mt-6"><DataTableShell empty={rows.length === 0 ? <EmptyState title="No planned materials" description="Add a material to see site needs and shortages." /> : undefined}>
      <table className={`w-full ${estimates ? "min-w-[1200px]" : "min-w-[1000px]"} text-left text-sm`}><thead className={tableHeadClass}><tr><th className="px-5 py-3">SKU / material</th><th className="px-4 py-3">Site / warehouse</th><th className="px-4 py-3 text-right">Planned</th><th className="px-4 py-3 text-right">Used / on site</th><th className="px-4 py-3 text-right">Available / requested</th><th className="px-4 py-3 text-right">Site need</th><th className="px-4 py-3 text-right">Purchase gap</th>{estimates && <th className="px-4 py-3 text-right">Estimated cost</th>}<th className="px-5 py-3 text-right">Next step</th></tr></thead>
      <tbody className="divide-y divide-slate-100">{rows.map((row) => {
        const params = new URLSearchParams({ project: id, site: row.project_site_id, warehouse: row.warehouse_id, material: row.material_id, quantity: String(row.quantity_to_request), date: row.required_on });
        const purchaseParams = new URLSearchParams({ material: row.material_id, warehouse: row.warehouse_id, quantity: String(row.procurement_shortage) });
        const actions: RecordAction[] = [
          ...(allowedSites.has(row.project_site_id) ? [{ label: "Edit", href: `?edit=${row.id}` }] : []),
          ...(canRequest && row.quantity_to_request > 0 ? [{ label: `Request ${quantity(row.quantity_to_request)} ${row.unit_symbol}`, href: `/requests/new?${params}` }] : []),
          ...(user.canManage && row.procurement_shortage > 0 ? [{ label: `Purchase ${quantity(row.procurement_shortage)} ${row.unit_symbol}`, href: `/purchase-orders/new?${purchaseParams}` }] : []),
        ];
        const estimate = estimates?.get(row.id);
        return <tr key={row.id}><td className="px-5 py-4"><p className="font-medium">{row.material_code} · {row.material_name}</p><p className="text-xs text-slate-500">Needed {row.required_on}</p></td><td className="px-4 py-4">{row.site_name}<span className="block text-xs text-slate-500">{row.warehouse_name}</span></td><td className="px-4 py-4 text-right tabular-nums">{quantity(row.planned_quantity)} {row.unit_symbol}</td><td className="px-4 py-4 text-right tabular-nums">{quantity(row.consumed_quantity)} / {quantity(row.site_on_hand)}</td><td className="px-4 py-4 text-right tabular-nums">{quantity(row.warehouse_available)} / {quantity(row.outstanding_request_quantity)}</td><td className="px-4 py-4 text-right font-medium tabular-nums">{quantity(row.quantity_to_request)} {row.unit_symbol}</td><td className="px-4 py-4 text-right font-medium tabular-nums">{quantity(row.procurement_shortage)} {row.unit_symbol}</td>{estimates && <td className="px-4 py-4 text-right tabular-nums">{estimate?.unit_cost != null && estimate.price_source ? <><p className="font-medium">{money(Number(estimate.estimated_cost))}</p><p className="text-xs text-slate-500">{money(Number(estimate.unit_cost))}/{row.unit_symbol} · {priceSourceLabel[estimate.price_source]}</p></> : <span className="text-xs text-slate-500">No price yet</span>}</td>}<td className="px-5 py-4 text-right"><RecordActionMenu name={row.material_name} actions={actions} /></td></tr>;
      })}</tbody></table>
    </DataTableShell></div>
  </>;
}
