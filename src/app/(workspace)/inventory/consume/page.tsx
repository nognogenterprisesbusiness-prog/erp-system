import { redirect } from "next/navigation";
import { uuidSchema } from "@nognog/domain";
import { requireUser } from "@/lib/auth";

export default async function InventoryFormRedirect({ searchParams }: { searchParams: Promise<{ material?: string; project?: string }> }) {
  const user = await requireUser();
  if (!(user.canManage || user.roles.some((role) => ["engineer", "foreman"].includes(role)))) redirect("/inventory");
  const query = await searchParams;
  const params = new URLSearchParams({ action: "use" });
  const material = uuidSchema.safeParse(query.material);
  if (material.success) params.set("material", material.data);
  const project = uuidSchema.safeParse(query.project);
  if (project.success) params.set("project", project.data);
  redirect(`/inventory?${params}`);
}
