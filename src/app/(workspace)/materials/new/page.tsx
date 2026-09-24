import { redirect } from "next/navigation";
import { MaterialForm } from "@/components/materials/material-form";
import { PageHeader } from "@/components/ui/page-header";
import { requireUser } from "@/lib/auth";
import { getMaterialReferences } from "@/lib/data/inventory";
export default async function NewMaterialPage() { const user = await requireUser(); if (!user.canManage) redirect("/materials"); const references = await getMaterialReferences(); return <><PageHeader eyebrow="Inventory catalog" title="Register material" description="Define the material's authoritative base unit before posting stock." /><div className="mt-7"><MaterialForm {...references} /></div></>; }
