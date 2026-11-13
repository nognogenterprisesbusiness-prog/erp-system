import { notFound, redirect } from "next/navigation";
import { uuidSchema } from "@nognog/domain";
import { requireFinanceViewer } from "@/lib/auth";
import type { ProjectCostFilters } from "@/components/projects/project-cost-records";

export default async function ProjectCostsPage({ params, searchParams }: { params: Promise<{ id: string }>; searchParams: Promise<ProjectCostFilters & { view?: string }> }) {
  await requireFinanceViewer();
  const { id } = await params;
  if (!uuidSchema.safeParse(id).success) notFound();
  const filters = await searchParams;
  const query = new URLSearchParams({ tab: "finance" });
  for (const key of ["posted", "expense", "equipmentPage", "expensesPage", "budgetsPage"] as const) {
    if (filters[key]) query.set(key, filters[key]);
  }
  const section = filters.view === "budget" ? "budget-history" : filters.view === "expenses" ? "expense-history" : "";
  redirect(`/projects/${id}?${query}${section ? `#${section}` : ""}`);
}
