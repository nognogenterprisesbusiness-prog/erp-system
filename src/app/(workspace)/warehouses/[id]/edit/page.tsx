import { redirect } from "next/navigation";

export default async function EditWarehousesPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  redirect(`/warehouses/${id}?edit=1`);
}
