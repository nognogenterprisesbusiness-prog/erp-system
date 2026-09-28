import { redirect } from "next/navigation";
export default async function EditMaterialPage({ params }: { params: Promise<{ id: string }> }) { const { id } = await params; redirect(`/materials/${id}?edit=1`); }
