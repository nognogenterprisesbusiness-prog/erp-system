import type { ProjectProfitabilityRow } from "@/types/database";

export type SummaryLine = { label: string; amount: number };

export function projectSummaryLines(summary: ProjectProfitabilityRow): SummaryLine[] {
  return [
    { label: "Contract value", amount: summary.contract_value },
    { label: "Approved budget", amount: summary.approved_budget },
    { label: "Material cost", amount: summary.material_cost },
    { label: "Labor cost", amount: summary.labor_cost },
    { label: "Equipment cost", amount: summary.equipment_cost },
    { label: "Additional expenses", amount: summary.other_cost },
    { label: "Approved site stock losses", amount: summary.site_stock_loss_cost },
    { label: "Approved project transfer losses", amount: summary.transfer_loss_cost },
    { label: "Total posted cost", amount: summary.total_posted_cost },
    { label: "Estimated gross project profit", amount: summary.estimated_gross_profit },
    { label: "Issued invoices", amount: summary.invoiced_amount },
    { label: "Client payments", amount: summary.cash_received },
    { label: "Outstanding invoices", amount: summary.receivables },
  ];
}

export const projectSummaryDisclaimer = "Provisional management report: contract value less posted costs. Not recognized-revenue, cash profit or a tax/accounting statement.";
