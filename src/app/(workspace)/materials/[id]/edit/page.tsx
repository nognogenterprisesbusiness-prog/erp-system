import { redirect } from "next/navigation";
import { MaterialForm } from "@/components/materials/material-form";
import { PageHeader } from "@/components/ui/page-header";
import { requireUser } from "@/lib/auth";
import { getMaterial } from "@/lib/data/inventory";
export default async function EditMaterialPage({ params }: { params: Promise<{ id: string }> }) { const { id } = await params; const user = await requireUser(); if (!user.canManage) redirect(`/materials/${id}`); const data = await getMaterial(id); return <><PageHeader eyebrow={data.material.code} title="Edit material" description="Changes affect future postings; posted ledger records remain unchanged." /><div className="mt-7"><MaterialForm material={data.material} {...data.references} /></div></>; }
