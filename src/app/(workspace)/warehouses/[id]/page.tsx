import Link from "next/link";
import Image from "next/image";
import { PencilEdit02Icon, PlusSignIcon } from "@hugeicons/core-free-icons";
import { HugeiconsIcon } from "@hugeicons/react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { EmptyState } from "@/components/ui/empty-state";
import { EntityQrSection } from "@/components/qr/entity-qr-section";
import { requireUser } from "@/lib/auth";
import { getWarehouse } from "@/lib/data/warehouses";
import { recordPhotoUrl } from "@/lib/media/record-photo-url";
import { findMunicipality } from "@/lib/locations";
import { assignWarehouseStaffAction, endWarehouseAssignmentAction, linkWarehouseProjectAction } from "../actions";

const inputClass = "h-10 rounded-lg border border-slate-200 bg-white px-3 text-sm";

export default async function WarehousePage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const [user, data] = await Promise.all([requireUser(), getWarehouse(id)]);
  const { warehouse, assignments, profiles, projects, allProjects } = data;
  const municipality = warehouse.municipality_code ? findMunicipality(warehouse.municipality_code) : undefined;
  const linkedIds = new Set(projects.map((project) => project.id));
  const availableProjects = allProjects.filter((project) => !linkedIds.has(project.id));
  return <>
    <div className="flex flex-col gap-4 sm:flex-row sm:items-start sm:justify-between">
      <div><p className="text-xs font-semibold uppercase tracking-[0.18em] text-cyan-700">{warehouse.code}</p><div className="mt-1.5 flex items-center gap-3"><h1 className="text-3xl font-semibold tracking-[-0.035em]">{warehouse.name}</h1><Badge variant={warehouse.status === "active" ? "active" : "neutral"}>{warehouse.status}</Badge></div><p className="mt-1 text-sm text-slate-500">{warehouse.address}</p></div>
      {user.canManage && <Button variant="outline" asChild><Link href={`/warehouses/${id}/edit`}><HugeiconsIcon icon={PencilEdit02Icon} size={17} /> Edit</Link></Button>}
    </div>
    {warehouse.photo_path && <div className="relative mt-6 h-52 overflow-hidden rounded-2xl bg-slate-100 sm:h-64"><Image src={recordPhotoUrl("warehouses", id)} alt={`${warehouse.name} warehouse`} fill sizes="(max-width: 768px) 100vw, 900px" unoptimized className="object-cover" /></div>}
    <EntityQrSection entityType="warehouse" entityId={id} canManage={user.canManage} />
    <section className="mt-8 grid gap-5 md:grid-cols-2">
      <article className="rounded-2xl border border-slate-200 bg-white p-6"><h2 className="font-semibold">Warehouse details</h2><dl className="mt-5 space-y-4 text-sm"><div><dt className="text-xs text-slate-400">Address</dt><dd className="mt-1 font-medium">{warehouse.address}</dd></div>{municipality && <div><dt className="text-xs text-slate-400">City / municipality</dt><dd className="mt-1 font-medium">{municipality.displayName}, {municipality.province} · {municipality.region}{municipality.zipCode ? ` · ${municipality.zipCode}` : ""}</dd></div>}<div><dt className="text-xs text-slate-400">Contact person</dt><dd className="mt-1 font-medium">{warehouse.contact_person || "Not recorded"}</dd></div><div><dt className="text-xs text-slate-400">Contact number</dt><dd className="mt-1 font-medium">{warehouse.contact_number || "Not recorded"}</dd></div>{warehouse.description && <div><dt className="text-xs text-slate-400">Description</dt><dd className="mt-1 leading-6 text-slate-600">{warehouse.description}</dd></div>}</dl></article>
      <article className="rounded-2xl border border-slate-200 bg-white p-6"><h2 className="font-semibold">Authorized projects</h2>{user.canManage && availableProjects.length > 0 && <form action={linkWarehouseProjectAction} className="mt-4 flex gap-2"><input type="hidden" name="warehouseId" value={id} /><select name="projectId" required defaultValue="" className={`${inputClass} min-w-0 flex-1`}><option value="" disabled>Select project</option>{availableProjects.map((project) => <option key={project.id} value={project.id}>{project.name} ({project.code})</option>)}</select><Button type="submit" size="icon" aria-label="Link project"><HugeiconsIcon icon={PlusSignIcon} size={17} /></Button></form>}{projects.length === 0 ? <EmptyState compact kind="items" title="No projects linked" /> : <div className="mt-4 space-y-2">{projects.map((project) => <Link href={`/projects/${project.id}`} key={project.id} className="block rounded-lg border border-slate-100 px-3 py-2 text-sm font-medium hover:border-cyan-300">{project.name}<span className="ml-2 text-xs font-normal text-slate-400">{project.code}</span></Link>)}</div>}</article>
    </section>
    <section className="mt-5 rounded-2xl border border-slate-200 bg-white p-6">
      <h2 className="font-semibold">Assigned personnel</h2>
      {user.canManage && <form action={assignWarehouseStaffAction} className="mt-5 grid gap-3 border-b border-slate-100 pb-5 md:grid-cols-3"><input type="hidden" name="warehouseId" value={id} /><select name="userId" required defaultValue="" className={inputClass}><option value="" disabled>Select person</option>{profiles.map((profile) => <option key={profile.id} value={profile.id}>{profile.full_name}</option>)}</select><input type="date" name="assignedOn" className={inputClass} defaultValue={new Date().toISOString().slice(0, 10)} required /><Button type="submit"><HugeiconsIcon icon={PlusSignIcon} size={16} /> Assign</Button></form>}
      {assignments.length === 0 ? <EmptyState compact kind="items" title="No personnel assigned" /> : <div className="divide-y divide-slate-100">{assignments.map((assignment) => <div key={assignment.id} className="flex items-center gap-3 py-4"><div className="flex-1"><p className="text-sm font-semibold">{assignment.profile?.full_name ?? "Unavailable profile"}</p><p className="mt-0.5 text-xs text-slate-500">Assigned {assignment.assigned_on}</p></div><Badge variant={assignment.status === "active" ? "active" : "neutral"}>{assignment.status}</Badge>{user.canManage && assignment.status === "active" && <form action={endWarehouseAssignmentAction}><input type="hidden" name="assignmentId" value={assignment.id} /><input type="hidden" name="warehouseId" value={id} /><Button variant="ghost" size="sm" type="submit">End assignment</Button></form>}</div>)}</div>}
    </section>
  </>;
}
