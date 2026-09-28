import { redirect } from "next/navigation";

export default async function EditSuppliersPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  redirect(`/suppliers/${id}?edit=1`);
}
