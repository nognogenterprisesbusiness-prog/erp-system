export const expenseBucketLabels: Record<string, string> = {
  permit: "Permit fees", subcontract: "Subcontract work", utilities: "Utilities",
  fuel: "Vehicle fuel", site_receipt: "Site receipt expenses", other: "Other recorded expenses",
  labor: "Labour receipts", equipment: "Equipment receipts",
};
export type ExpenseBreakdown = { bucket: string; amount: number; entry_count: number };
export type ProjectCostCategory = { label: string; amountCentavos: number; color: string; href?: string; actionLabel?: string; relatedLinks?: { label: string; href: string }[]; detail?: string };
type Totals = { material_cost: number; labor_cost: number; equipment_cost: number; site_stock_loss_cost: number; transfer_loss_cost: number };

export function projectCostCategories(projectId: string, totals: Totals, expenses: ExpenseBreakdown[]): ProjectCostCategory[] {
  const cents = (amount: number) => Math.round(Number(amount) * 100);
  return [
    { label: "Materials used", amountCentavos: cents(totals.material_cost), color: "#0891b2", href: `/projects/${projectId}?tab=materials#material-consumption`, actionLabel: "View material use", detail: "Posted material consumption" },
    { label: "Labour", amountCentavos: cents(totals.labor_cost), color: "#d97706", href: `/projects/${projectId}/attendance`, actionLabel: "View attendance", relatedLinks: expenses.some(entry => entry.bucket === "labor" && Number(entry.amount) > 0) ? [{ label: "View labour receipts", href: `/projects/${projectId}/costs?view=expenses&expense=labor` }] : [], detail: "Attendance and labour receipts" },
    { label: "Equipment & vehicles", amountCentavos: cents(totals.equipment_cost), color: "#8b5cf6", href: `/projects/${projectId}/costs#equipment-history`, actionLabel: "View hours", relatedLinks: expenses.some(entry => entry.bucket === "equipment" && Number(entry.amount) > 0) ? [{ label: "View equipment receipts", href: `/projects/${projectId}/costs?view=expenses&expense=equipment` }] : [], detail: "Recorded hours and equipment receipts" },
    ...expenses.filter((entry) => !["labor", "equipment"].includes(entry.bucket)).map((entry, index) => ({
      label: expenseBucketLabels[entry.bucket] ?? entry.bucket, amountCentavos: cents(entry.amount),
      color: ["#059669", "#2563eb", "#db2777", "#0d9488", "#65a30d", "#c2410c"][index % 6],
      href: `/projects/${projectId}/costs?view=expenses&expense=${encodeURIComponent(entry.bucket)}`,
      detail: `${entry.entry_count} posted ${Number(entry.entry_count) === 1 ? "entry" : "entries"}`,
    })),
    { label: "Site stock loss / damage", amountCentavos: cents(totals.site_stock_loss_cost), color: "#64748b" },
    { label: "Delivery loss / damage", amountCentavos: cents(totals.transfer_loss_cost), color: "#475569" },
  ];
}
