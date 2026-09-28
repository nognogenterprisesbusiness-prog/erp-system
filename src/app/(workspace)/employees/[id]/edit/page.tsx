import { redirect } from "next/navigation";

export default async function EditEmployeesPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  redirect(`/employees/${id}?edit=1`);
}
