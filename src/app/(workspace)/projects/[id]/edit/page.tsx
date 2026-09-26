import { redirect } from "next/navigation";
import { requireUser } from "@/lib/auth";

export default async function EditProjectPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const user = await requireUser();
  if (!user.canManage) redirect(`/projects/${id}`);
  redirect(`/projects/${id}?edit=1`);
}
