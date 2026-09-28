import { randomUUID } from "node:crypto";
import { redirect } from "next/navigation";
import { uuidSchema } from "@nognog/domain";
import { MaterialRequestForm } from "@/components/requests/material-request-form";
import { PageHeader } from "@/components/ui/page-header";
import { requireUser } from "@/lib/auth";
import { getMaterialRequestChoices } from "@/lib/data/material-requests";

export default async function NewMaterialRequestPage({ searchParams }: { searchParams: Promise<{ material?: string; project?: string; site?: string; warehouse?: string; quantity?: string; date?: string }> }) {
  const user = await requireUser();
  if (user.canManage || !user.roles.some((role) => ["engineer", "foreman"].includes(role))) redirect("/requests");
  const choices = await getMaterialRequestChoices();
  const query = await searchParams;
  const requestedMaterial = uuidSchema.safeParse(query.material);
  const initialMaterialId = requestedMaterial.success && choices.materials.some((item) => item.id === requestedMaterial.data) ? requestedMaterial.data : "";
  const project = uuidSchema.safeParse(query.project);
  const initialProjectId = project.success && choices.projects.some((item) => item.id === project.data) ? project.data : undefined;
  const site = uuidSchema.safeParse(query.site);
  const initialSiteId = site.success && choices.sites.some((item) => item.id === site.data && item.project_id === initialProjectId) ? site.data : undefined;
  const warehouse = uuidSchema.safeParse(query.warehouse);
  const initialWarehouseId = warehouse.success && choices.warehouses.some((item) => item.warehouse_id === warehouse.data && item.project_id === initialProjectId) ? warehouse.data : undefined;
  const initialQuantity = /^\d+(\.\d{1,4})?$/.test(query.quantity ?? "") && Number(query.quantity) > 0 ? query.quantity : undefined;
  const initialDate = /^\d{4}-\d{2}-\d{2}$/.test(query.date ?? "") ? query.date : undefined;
  return <><PageHeader title="New material request" description="Request materials for an assigned project and site. A manager reviews quantities before stock is released." />
    <div className="mt-7 max-w-4xl"><MaterialRequestForm choices={choices} idempotencyKey={randomUUID()} initialLineKey={randomUUID()} initialMaterialId={initialMaterialId} initialProjectId={initialProjectId} initialSiteId={initialSiteId} initialWarehouseId={initialWarehouseId} initialQuantity={initialQuantity} initialDate={initialDate} /></div></>;
}
