import { redirect } from "next/navigation";
import { uuidSchema } from "@nognog/domain";
import { requireManager } from "@/lib/auth";

export default async function NewPurchaseRedirect({ searchParams }: { searchParams: Promise<{ material?: string; warehouse?: string; quantity?: string }> }) {
  await requireManager();
  const query = await searchParams;
  const params = new URLSearchParams({ create: "1" });
  for (const name of ["material", "warehouse"] as const) {
    const id = uuidSchema.safeParse(query[name]);
    if (id.success) params.set(name, id.data);
  }
  if (/^\d+(\.\d{1,4})?$/.test(query.quantity ?? "") && Number(query.quantity) > 0) params.set("quantity", query.quantity!);
  redirect(`/purchase-orders?${params}`);
}
