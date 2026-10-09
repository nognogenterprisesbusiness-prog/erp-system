import { redirect } from "next/navigation";
import { requireUser } from "@/lib/auth";

// Keep existing bookmarks working; the catalog now lives in Inventory.
export default async function MaterialsRedirect({ searchParams }: {
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}) {
  await requireUser();
  const query = await searchParams;
  const params = new URLSearchParams();
  if (typeof query.q === "string" && query.q) params.set("q", query.q.slice(0, 80));
  if (query.status === "all") params.set("status", "any");
  else if (query.status === "inactive") params.set("status", "inactive");
  if (query.create === "1") params.set("create", "1");
  redirect(`/inventory${params.size ? `?${params}` : ""}`);
}
