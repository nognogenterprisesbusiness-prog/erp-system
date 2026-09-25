"use client";

import { useRef, useState, type FormEvent } from "react";
import { PlusSignIcon } from "@hugeicons/core-free-icons";
import { HugeiconsIcon } from "@hugeicons/react";
import { Button } from "@/components/ui/button";
import { DialogHeading } from "@/components/ui/dialog-heading";
import { EmptyState } from "@/components/ui/empty-state";
import { MaterialThumbnail } from "@/components/ui/material-thumbnail";
import { RecordActionMenu, type RecordAction } from "@/components/ui/record-action-menu";
import { SelectPicker } from "@/components/ui/select-picker";
import { deleteDemoMaterialPlan, getDemoDatabase, saveDemoMaterialPlan } from "@/lib/demo/database";
import { demoMaterialPlanSummary } from "@/lib/demo/material-plan";
import { isDemoManager, type DemoData, type DemoRole } from "@/lib/demo/schema";

type Project = DemoData["projects"][number];
const format = new Intl.NumberFormat("en-PH", { maximumFractionDigits: 3 });
const fieldClass = "h-10 w-full rounded-lg border border-slate-200 bg-white px-3 text-sm outline-none focus-visible:ring-2 focus-visible:ring-cyan-600";

export function DemoProjectMaterialPlan({ tables, project, role, userId, onChanged }: { tables: DemoData; project: Project; role: DemoRole; userId: string; onChanged: (message: string) => Promise<void> }) {
  const [editingId, setEditingId] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const dialog = useRef<HTMLDialogElement>(null);
  const canPlan = project.status === "active" && (isDemoManager(role) || role === "project_manager" && tables.projectAssignments.some((row) => row.projectId === project.id && row.userId === userId));
  const canRequest = project.status === "active" && !isDemoManager(role) && ["project_manager", "engineer", "foreman"].includes(role) && tables.projectAssignments.some((row) => row.projectId === project.id && row.userId === userId);
  const lines = tables.projectMaterialPlans.filter((row) => row.projectId === project.id);
  const editing = lines.find((row) => row.id === editingId);

  function openForm(id: string | null) {
    setEditingId(id);
    setError("");
    dialog.current?.showModal();
  }

  function closeForm() {
    dialog.current?.close();
    setEditingId(null);
    setError("");
  }

  async function save(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (busy) return;
    setBusy(true); setError("");
    const form = new FormData(event.currentTarget);
    try {
      await saveDemoMaterialPlan(getDemoDatabase(), {
        id: editing?.id,
        projectId: project.id,
        siteId: String(form.get("siteId") ?? ""),
        warehouseId: String(form.get("warehouseId") ?? ""),
        materialId: String(form.get("materialId") ?? ""),
        plannedQuantity: Number(form.get("plannedQuantity")),
      });
      await onChanged(editing ? "Material plan updated." : "Material added to plan.");
      closeForm();
    } catch (cause) { setError(cause instanceof Error ? cause.message : "Unable to save the material plan."); }
    finally { setBusy(false); }
  }

  async function remove(id: string, materialName: string) {
    if (!window.confirm(`Remove ${materialName} from this project plan? Posted stock and costs will not change.`)) return;
    setBusy(true); setError("");
    try { await deleteDemoMaterialPlan(getDemoDatabase(), id); await onChanged("Material removed from plan."); }
    catch (cause) { setError(cause instanceof Error ? cause.message : "Unable to remove the planned material."); }
    finally { setBusy(false); }
  }

  return <section aria-label="Project material plan">
    <div className="flex flex-wrap items-center justify-between gap-3"><div><h2 className="text-base font-semibold">Material plan</h2><p className="mt-1 text-xs text-slate-500">Plan minus used, on-site and open-request quantities. Planning does not move stock.</p></div>{canPlan && <Button type="button" size="sm" variant="outline" onClick={() => openForm(null)}><HugeiconsIcon icon={PlusSignIcon} size={16} />Add material</Button>}</div>
    <dialog ref={dialog} onClose={closeForm} aria-labelledby="demo-material-plan-title" className="m-auto w-[min(100%-2rem,520px)] rounded-2xl border border-slate-200 bg-white p-6 text-[#07152d] shadow-2xl backdrop:bg-slate-950/45"><form key={editing?.id ?? "new"} onSubmit={(event) => void save(event)} className="grid gap-4 sm:grid-cols-2">
      <div className="sm:col-span-2"><DialogHeading id="demo-material-plan-title" title={editing ? "Edit planned material" : "Add planned material"} onClose={closeForm} disabled={busy} /></div>
      <label className="grid gap-1.5 text-xs font-medium">Site<SelectPicker label="Project site" name="siteId" defaultValue={editing?.siteId ?? tables.sites.find((site) => site.projectId === project.id)?.id} options={tables.sites.filter((site) => site.projectId === project.id).map((site) => ({ value: site.id, label: site.name }))} /></label>
      <label className="grid gap-1.5 text-xs font-medium">Source warehouse<SelectPicker label="Source warehouse" name="warehouseId" defaultValue={editing?.warehouseId ?? tables.warehouses[0]?.id} options={tables.warehouses.map((warehouse) => ({ value: warehouse.id, label: warehouse.name }))} /></label>
      <label className="grid gap-1.5 text-xs font-medium">Material / SKU<SelectPicker label="Material" name="materialId" defaultValue={editing?.materialId ?? tables.materials[0]?.id} options={tables.materials.map((material) => ({ value: material.id, label: `${material.code} · ${material.name}` }))} /></label>
      <label className="grid gap-1.5 text-xs font-medium">Planned quantity<input className={fieldClass} name="plannedQuantity" type="number" min="0.001" max="1000000000" step="0.001" defaultValue={editing?.plannedQuantity} required /></label>
      {error && <p role="alert" className="rounded-lg bg-red-50 p-3 text-sm text-red-700 sm:col-span-2">{error}</p>}
      <div className="flex justify-end gap-2 sm:col-span-2"><Button type="button" variant="outline" onClick={closeForm} disabled={busy}>Cancel</Button><Button type="submit" disabled={busy || !tables.sites.some((site) => site.projectId === project.id) || !tables.warehouses.length || !tables.materials.length}>{busy ? "Saving…" : "Save"}</Button></div>
    </form></dialog>
    {!lines.length ? <EmptyState compact kind="items" title="No materials planned" /> : <div className="mt-4 overflow-x-auto rounded-xl border border-slate-200"><table className="w-full min-w-[670px] text-left text-sm"><thead className="bg-slate-50 text-xs text-slate-500"><tr><th className="px-3 py-2.5">Material</th><th className="px-3 py-2.5">Site / warehouse</th><th className="px-3 py-2.5 text-right">Planned</th><th className="px-3 py-2.5 text-right">Used / on site</th><th className="px-3 py-2.5 text-right">Still needed</th><th className="px-3 py-2.5 text-right">Source gap</th><th className="px-3 py-2.5 text-right">Actions</th></tr></thead><tbody className="divide-y divide-slate-100">{lines.map((line) => {
      const material = tables.materials.find((item) => item.id === line.materialId);
      const site = tables.sites.find((item) => item.id === line.siteId);
      const warehouse = tables.warehouses.find((item) => item.id === line.warehouseId);
      const summary = demoMaterialPlanSummary(tables, line);
      const actions: RecordAction[] = [
        ...(canPlan ? [{ label: "Edit", onSelect: () => openForm(line.id) }, { label: "Delete", onSelect: () => void remove(line.id, material?.name ?? "material"), destructive: true }] : []),
        ...(canRequest && summary.need > 0 ? [{ label: `Request ${format.format(summary.need)} ${material?.unit ?? "units"}`, href: `/demo?view=requests&action=new&project=${project.id}&site=${line.siteId}&warehouse=${line.warehouseId}&material=${line.materialId}&quantity=${summary.need}` }] : []),
      ];
      return <tr key={line.id}><td className="px-3 py-3"><div className="flex items-center gap-2"><MaterialThumbnail name={material?.name ?? "Material"} photo={material?.photo} /><span><span className="block font-medium">{material?.name ?? "Material"}</span><span className="text-xs text-slate-500">{material?.code ?? "—"}</span></span></div></td><td className="px-3 py-3 text-xs text-slate-600">{site?.name ?? "Site"}<span className="block text-slate-400">{warehouse?.name ?? "Warehouse"}</span></td><td className="px-3 py-3 text-right tabular-nums">{format.format(line.plannedQuantity)} {material?.unit}</td><td className="px-3 py-3 text-right tabular-nums">{format.format(summary.used)} / {format.format(summary.onSite)}</td><td className="px-3 py-3 text-right font-semibold tabular-nums">{format.format(summary.need)}<span className="block text-xs font-normal text-slate-500">{format.format(summary.openRequests)} requested</span></td><td className="px-3 py-3 text-right tabular-nums">{format.format(summary.sourceGap)}<span className="block text-xs text-slate-500">{format.format(summary.warehouseOnHand)} in warehouse</span></td><td className="px-3 py-3 text-right"><RecordActionMenu name={material?.name ?? "material"} actions={actions} disabled={busy} /></td></tr>;
    })}</tbody></table></div>}
  </section>;
}
