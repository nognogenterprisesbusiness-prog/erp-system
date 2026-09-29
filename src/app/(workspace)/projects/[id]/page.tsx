import { IntentLink as Link } from "@/components/layout/intent-link";
import { randomUUID } from "node:crypto";
import { PhotoViewer } from "@/components/ui/photo-viewer";
import { ArrowLeft01Icon, Building03Icon, Calendar03Icon, Download04Icon, Money03Icon, PackageIcon, UserGroupIcon } from "@hugeicons/core-free-icons";
import { HugeiconsIcon } from "@hugeicons/react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { EmptyState } from "@/components/ui/empty-state";
import { MetricCard } from "@/components/ui/metric-card";
import { ProjectCostBreakdown } from "@/components/projects/project-cost-breakdown";
import { EquipmentUsageForm } from "@/components/projects/equipment-usage-form";
import { ProjectForm } from "@/components/projects/project-form";
import { RecordCreateDialog } from "@/components/ui/record-create-dialog";
import { ProjectLabourDistribution } from "@/components/projects/project-labour-distribution";
import { ProjectPersonnelSection, ProjectSitesSection } from "@/components/projects/project-people-and-sites";
import { ShareProjectButton } from "@/components/projects/share-project-button";
import { ProjectWorkforceSection } from "@/components/workforce/project-workforce-section";
import { requireUser } from "@/lib/auth";
import { getProjectEquipmentChoices } from "@/lib/data/assets";
import { getProject } from "@/lib/data/projects";
import { getProjectProfitability } from "@/lib/data/project-costs";
import { getProjectMaterialCost } from "@/lib/data/inventory";
import { getProjectMaterialPlan, getProjectProgress } from "@/lib/data/project-operations";
import { getProjectWorkerCount, getProjectWorkforce } from "@/lib/data/workforce";
import { getActiveQrCodesForEntities } from "@/lib/data/qr-codes";
import { recordPhotoUrl } from "@/lib/media/record-photo-url";
import { findMunicipality } from "@/lib/locations";
import { archiveProjectAction } from "../actions";

const money = new Intl.NumberFormat("en-PH", { style: "currency", currency: "PHP" });
const quantity = new Intl.NumberFormat("en-PH", { maximumFractionDigits: 3 });
const date = (value: string | null) => value ? new Intl.DateTimeFormat("en-PH", { dateStyle: "medium" }).format(new Date(`${value}T00:00:00`)) : "Not recorded";
const tabs = [
  { key: "overview", label: "Overview" }, { key: "sites", label: "Sites" },
  { key: "labour", label: "Labour" }, { key: "materials", label: "Materials" },
  { key: "finance", label: "Finance" },
] as const;

export default async function ProjectDetailPage({ params, searchParams }: {
  params: Promise<{ id: string }>;
  searchParams: Promise<{ tab?: string; edit?: string }>;
}) {
  const [{ id }, filters, user] = await Promise.all([params, searchParams, requireUser()]);
  const data = await getProject(id);
  const { project, sites, profiles } = data;
  const visibleTabs = tabs.filter((tab) => tab.key === "finance" ? user.canViewLaborRates : tab.key === "materials" ? user.canViewDailyReports : true);
  const tab = visibleTabs.find((item) => item.key === filters.tab)?.key ?? "overview";
  const returnParams = new URLSearchParams();
  if (tab !== "overview") returnParams.set("tab", tab);
  const returnHref = `/projects/${id}${returnParams.size ? `?${returnParams}` : ""}`;
  const [workerCount, progress, profitability, workforce, materialPlan, materialCosts, siteQrCodes, equipmentChoices] = await Promise.all([
    getProjectWorkerCount(id),
    user.canViewDailyReports ? getProjectProgress(id) : Promise.resolve([]),
    user.canViewLaborRates ? getProjectProfitability(id) : Promise.resolve(null),
    tab === "labour" ? getProjectWorkforce(id, user.canViewLaborRates) : Promise.resolve(null),
    tab === "materials" ? getProjectMaterialPlan(id) : Promise.resolve([]),
    tab === "materials" && (user.canViewLaborRates || user.roles.includes("engineer")) ? getProjectMaterialCost(id) : Promise.resolve(null),
    tab === "sites" && user.canManage ? getActiveQrCodesForEntities("project_site", sites.map((site) => site.id)) : Promise.resolve([]),
    user.roles.includes("foreman") && ["active", "on_hold"].includes(project.status) ? getProjectEquipmentChoices(id) : Promise.resolve([]),
  ]);
  const today = new Intl.DateTimeFormat("sv-SE", { timeZone: "Asia/Manila", year: "numeric", month: "2-digit", day: "2-digit" }).format(new Date());
  const completion = Number(progress[0]?.completion_percent ?? 0);
  const municipality = project.municipality_code ? findMunicipality(project.municipality_code) : undefined;
  const manager = profiles.find((profile) => profile.id === project.project_manager_id)?.full_name ?? "Unassigned";
  const totalMaterialCost = materialCosts?.reduce((sum, row) => sum + Number(row.cost_total), 0) ?? 0;
  const costBreakdown = profitability ? <ProjectCostBreakdown categories={[
    { label: "Materials", amountCentavos: Math.round(Number(profitability.material_cost) * 100), color: "#0891b2" },
    { label: "Labour", amountCentavos: Math.round(Number(profitability.labor_cost) * 100), color: "#f59e0b" },
    { label: "Equipment", amountCentavos: Math.round(Number(profitability.equipment_cost) * 100), color: "#8b5cf6" },
    { label: "Other / losses", amountCentavos: Math.round((Number(profitability.other_cost) + Number(profitability.site_stock_loss_cost) + Number(profitability.transfer_loss_cost)) * 100), color: "#10b981" },
  ]} /> : null;
  return <>
    <Link href="/projects" className="mb-4 inline-flex items-center gap-2 rounded-full text-sm text-slate-500 hover:text-cyan-700"><HugeiconsIcon icon={ArrowLeft01Icon} size={17} strokeWidth={1.5} />Projects</Link>
    <header className="flex flex-col gap-4 xl:flex-row xl:items-start xl:justify-between">
      <div className="min-w-0"><p className="text-xs font-semibold uppercase tracking-[0.12em] text-cyan-700">{project.code}</p><div className="mt-1.5 flex flex-wrap items-center gap-3"><h1 className="text-2xl font-semibold tracking-tight sm:text-3xl">{project.name}</h1><Badge variant={project.status === "active" || project.status === "completed" ? "active" : project.status === "on_hold" ? "review" : "neutral"}>{project.status.replace("_", " ")}</Badge></div><p className="mt-2 text-sm text-slate-500">{project.city_province}</p></div>
      <div className="flex flex-wrap gap-2"><ShareProjectButton href={`/projects/${id}`} />{user.roles.includes("foreman") && ["active", "on_hold"].includes(project.status) && <RecordCreateDialog title="Record equipment hours" triggerLabel="Record equipment hours"><p className="mb-4 text-sm text-slate-500">Record the hours used at this project&apos;s site. An Admin manages rates; costs are calculated automatically.</p>{equipmentChoices.length ? <EquipmentUsageForm projectId={id} assets={equipmentChoices} initialKey={randomUUID()} today={today} /> : <EmptyState compact title="No equipment or vehicles at an active project site" description="Ask an Admin to assign one and set its hourly rate first." />}</RecordCreateDialog>}{user.canViewLaborRates && <><Button variant="outline" asChild><a href={`/projects/${id}/costs/export?format=pdf`}><HugeiconsIcon icon={Download04Icon} size={16} strokeWidth={1.5} />PDF</a></Button><Button variant="outline" asChild><a href={`/projects/${id}/costs/export?format=xlsx`}><HugeiconsIcon icon={Download04Icon} size={16} strokeWidth={1.5} />Excel</a></Button></>}{user.canManage && <><RecordCreateDialog key={`${project.id}:${project.updated_at}`} title="Edit project" triggerLabel="Edit" triggerVariant="outline" initialOpen={filters.edit === "1"} closeHref={returnHref}><ProjectForm project={project} profiles={data.engineers} /></RecordCreateDialog><form action={archiveProjectAction}><input type="hidden" name="id" value={id} /><Button variant="outline" type="submit">Archive</Button></form></>}</div>
    </header>
    <div className="relative mt-6 grid h-44 place-items-center overflow-hidden rounded-2xl border border-slate-200 bg-slate-100 text-slate-400 sm:h-60">
      {project.photo_path ? <PhotoViewer src={recordPhotoUrl("projects", id, project.updated_at)} alt={`${project.name} project`} sizes="(max-width: 768px) 100vw, 1200px" /> : <HugeiconsIcon icon={Building03Icon} size={48} strokeWidth={1.3} aria-label="No project photo uploaded" />}
    </div>
    <section aria-label="Project summary" className="mt-5 grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
      <MetricCard label="Timeline" value={`${project.estimated_duration_days} days`} detail={`${date(project.start_date)} – ${date(project.target_completion_date)}`} icon={Calendar03Icon} tone="bg-blue-50 text-blue-600" />
      {profitability ? <MetricCard label="Approved budget" value={money.format(Number(profitability.approved_budget))} detail={`Used ${money.format(Number(profitability.total_posted_cost))}`} icon={Money03Icon} tone="bg-emerald-50 text-emerald-600" /> : <MetricCard label="Sites" value={sites.length} icon={Building03Icon} tone="bg-emerald-50 text-emerald-600" />}
      <MetricCard label="Workers" value={workerCount} detail="Active project assignments" icon={UserGroupIcon} tone="bg-amber-50 text-amber-600" />
      <MetricCard label="Progress" value={user.canViewDailyReports ? `${completion}%` : "—"} detail={!user.canViewDailyReports ? "Available to project reporting roles" : progress[0] ? `Updated ${date(progress[0].progress_date)}` : "No progress update recorded"} icon={Building03Icon} tone="bg-violet-50 text-violet-600" />
    </section>
    {(user.canManage || user.canViewDailyReports) && <div className="mt-4 flex justify-end"><Button variant="outline" size="sm" asChild><Link href={`/documents?project=${id}`}>Project documents</Link></Button></div>}
    <nav aria-label="Project sections" className="mt-6 grid grid-cols-2 gap-1 rounded-2xl bg-slate-100 p-1 sm:flex sm:rounded-full">{visibleTabs.map((item) => <Link key={item.key} href={`/projects/${id}${item.key === "overview" ? "" : `?tab=${item.key}`}`} scroll={false} aria-current={tab === item.key ? "page" : undefined} className={`min-w-0 flex-1 rounded-full px-3 py-2.5 text-center text-sm font-medium transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-cyan-600 ${tab === item.key ? "bg-white text-slate-900 shadow-sm" : "text-slate-500 hover:text-slate-900"}`}>{item.label}</Link>)}</nav>
    <div className="mt-6">
      {tab === "overview" && <div className="space-y-5">
        <section className="rounded-2xl border border-slate-200 bg-white p-5 sm:p-6"><h2 className="text-base font-semibold">Project overview</h2>{project.description && <p className="mt-3 text-sm leading-6 text-slate-600">{project.description}</p>}<dl className="mt-5 grid gap-5 sm:grid-cols-2 lg:grid-cols-4">{[["Client", project.client_name], ["Lead engineer", manager], ["Address", project.address], ["City / municipality", municipality ? `${municipality.displayName}, ${municipality.province}` : project.city_province], ["Actual completion", date(project.actual_completion_date)]].map(([label, value]) => <div key={label}><dt className="text-xs text-slate-500">{label}</dt><dd className="mt-1 text-sm font-medium">{value}</dd></div>)}</dl></section>
        <div className="grid items-start gap-5 xl:grid-cols-2">
          {user.canViewDailyReports && <section className="rounded-2xl border border-slate-200 bg-white p-5 sm:p-6"><div className="flex items-center justify-between gap-3"><h2 className="text-base font-semibold">Project progress</h2>{user.canViewDailyReports && <Button variant="outline" size="sm" asChild><Link href={`/projects/${id}/progress`}>View history</Link></Button>}</div><div className="mt-5 flex justify-between text-sm"><span className="text-slate-500">Completion</span><span className="font-semibold tabular-nums">{completion}%</span></div><div role="progressbar" aria-label="Project completion" aria-valuemin={0} aria-valuemax={100} aria-valuenow={completion} className="mt-2 h-2 overflow-hidden rounded-full bg-slate-100"><div className="h-full rounded-full bg-cyan-600" style={{ width: `${completion}%` }} /></div>{progress.length ? <div className="mt-5 space-y-4">{progress.slice(0, 5).map((entry) => <article key={entry.id}><div className="flex justify-between gap-3 text-sm"><Link className="font-medium hover:text-cyan-700" href={`/reports/daily/${entry.daily_report_id}`}>{entry.summary}</Link><span className="shrink-0 tabular-nums">{entry.completion_percent}%</span></div><p className="mt-1 text-xs text-slate-500">{date(entry.progress_date)}</p></article>)}</div> : <p className="mt-4 text-xs text-slate-500">Progress is recorded from approved daily reports.</p>}</section>}
          {costBreakdown}
        </div>
      </div>}
      {tab === "sites" && <ProjectSitesSection data={data} canManage={user.canManage} qrCodes={siteQrCodes} />}
      {tab === "labour" && workforce && <><div className="mb-4 flex flex-wrap justify-end gap-2">{(user.canManage || user.roles.includes("foreman")) && <Button variant="outline" asChild><Link href={`/projects/${id}/attendance`}>{user.canManage ? "Attendance & labour cost" : "Mark attendance"}</Link></Button>}</div><ProjectLabourDistribution workforce={workforce} canViewRates={user.canViewLaborRates} /><ProjectWorkforceSection projectId={id} projectName={project.name} workforce={workforce} canManage={user.canManage} canViewRates={user.canViewLaborRates} /><ProjectPersonnelSection data={data} canManage={user.canManage} /></>}
      {tab === "materials" && <div className="space-y-5">
        <section className="rounded-2xl border border-slate-200 bg-white p-5 sm:p-6"><div className="flex flex-wrap items-center justify-between gap-3"><h2 className="text-base font-semibold">Material inventory</h2><div className="flex flex-wrap gap-2"><Button variant="outline" asChild><Link href={`/projects/${id}/materials`}>Material plan</Link></Button>{(user.canManage || user.roles.some((role) => ["engineer", "foreman"].includes(role))) && <Button variant="outline" asChild><Link href={`/inventory/consume?project=${id}`}>Record use</Link></Button>}</div></div>
          {materialPlan.length === 0 ? <EmptyState compact title="No materials planned" /> : <div className="mt-6 space-y-6">{materialPlan.map((line) => { const used = Number(line.consumed_quantity); const planned = Number(line.planned_quantity); const percent = planned > 0 ? Math.min(100, used / planned * 100) : 0; return <article key={line.id}><div className="flex items-start gap-3"><span className="grid size-10 shrink-0 place-items-center rounded-xl bg-slate-100 text-slate-500"><HugeiconsIcon icon={PackageIcon} size={20} strokeWidth={1.4} /></span><div className="min-w-0 flex-1"><h3 className="text-sm font-medium">{line.material_code} · {line.material_name}</h3><p className="mt-1 text-xs text-slate-500">{quantity.format(used)} / {quantity.format(planned)} {line.unit_symbol} used · {line.site_name}</p></div><Badge variant={Number(line.quantity_to_request) > 0 ? "review" : "active"}>{Number(line.quantity_to_request) > 0 ? "Shortage" : "Covered"}</Badge></div><div role="progressbar" aria-label={`${line.material_name} used against plan at ${line.site_name}`} aria-valuemin={0} aria-valuemax={100} aria-valuenow={percent} className="mt-3 h-2 overflow-hidden rounded-full bg-slate-100"><div className="h-full rounded-full bg-cyan-600" style={{ width: `${percent}%` }} /></div><div className="mt-2 flex flex-wrap justify-between gap-2 text-xs text-slate-500"><span>At site: {quantity.format(Number(line.site_on_hand))} {line.unit_symbol}</span><span>To request: {quantity.format(Number(line.quantity_to_request))} {line.unit_symbol}</span><span>Purchase shortage: {quantity.format(Number(line.procurement_shortage))} {line.unit_symbol}</span></div></article>; })}</div>}
        </section>
        {materialCosts && <section className="rounded-2xl border border-slate-200 bg-white p-5 sm:p-6"><div className="flex justify-between gap-3"><h2 className="text-base font-semibold">Posted material consumption</h2><span className="text-sm font-semibold tabular-nums">{money.format(totalMaterialCost)}</span></div>{materialCosts.length === 0 ? <EmptyState compact title="No material consumption posted" /> : <div className="mt-4 overflow-x-auto"><table className="w-full min-w-[480px] text-left text-sm"><thead className="border-b border-slate-100 text-slate-500"><tr><th className="py-3 font-medium">SKU</th><th className="py-3 font-medium">Material</th><th className="py-3 text-right font-medium">Used</th><th className="py-3 text-right font-medium">Cost</th></tr></thead><tbody className="divide-y divide-slate-100">{materialCosts.map((row) => <tr key={row.material_id}><td className="py-3">{row.material_code}</td><td className="py-3">{row.material_name}</td><td className="py-3 text-right tabular-nums">{quantity.format(Number(row.quantity))} {row.unit_symbol}</td><td className="py-3 text-right font-medium tabular-nums">{money.format(Number(row.cost_total))}</td></tr>)}</tbody></table></div>}</section>}
      </div>}
      {tab === "finance" && profitability && <div className="space-y-5"><div className="flex flex-wrap justify-end gap-2"><Button variant="outline" asChild><Link href={`/projects/${id}/costs`}>Manage costs & budget</Link></Button><Button variant="outline" asChild><Link href="/billing">Client invoices & payments</Link></Button></div><section className="rounded-2xl border border-slate-200 bg-white p-5 sm:p-6"><h2 className="text-base font-semibold">Project financial summary</h2><dl className="mt-5 grid gap-5 sm:grid-cols-2 lg:grid-cols-3">{[["Contract value", profitability.contract_value], ["Approved budget", profitability.approved_budget], ["Posted costs", profitability.total_posted_cost], ["Estimated gross profit", profitability.estimated_gross_profit], ["Issued invoices", profitability.invoiced_amount], ["Payments received", profitability.cash_received], ["Outstanding invoices", profitability.receivables]].map(([label, amount]) => <div key={String(label)}><dt className="text-xs text-slate-500">{label}</dt><dd className="mt-1 text-lg font-semibold tabular-nums">{money.format(Number(amount))}</dd></div>)}</dl><p className="mt-5 text-xs leading-5 text-slate-500">Estimated gross profit is contract value less posted costs, not final accounting profit. Invoices and collections are reported separately.</p></section>{costBreakdown}</div>}
    </div>
  </>;
}
