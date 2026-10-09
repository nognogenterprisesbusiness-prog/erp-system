import { redirect } from "next/navigation";
import { pageNumber } from "@/lib/data/pagination";
import { requireUser } from "@/lib/auth";

export default async function MissingMaterialsRedirect({ searchParams }: { searchParams: Promise<{ page?: string }> }) {
  await requireUser();
  const page = pageNumber((await searchParams).page);
  redirect(page > 1 ? `/requests?view=missing&page=${page}` : "/requests?view=missing");
}
