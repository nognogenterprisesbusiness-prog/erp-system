import { redirect } from "next/navigation";
import { uuidSchema } from "@nognog/domain";
import { requireUser } from "@/lib/auth";

export default async function InventoryFormRedirect({ searchParams }: { searchParams: Promise<{ material?: string; project?: string }> }) {
  const user = await requireUser();
  if (!(user.canManage)) redirect("/inventory");
  const query = await searchParams;
  const params = new URLSearchParams({ action: "stock-out" });
  const material = uuidSchema.safeParse(query.material);
  if (material.success) params.set("material", material.data);
  redirect(`/inventory?${params}`);
}
