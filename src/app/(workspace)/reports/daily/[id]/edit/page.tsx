import { redirect } from "next/navigation";

export default async function EditDailyPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  redirect(`/reports/daily/${id}?edit=1`);
}
