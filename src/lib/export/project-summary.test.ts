import assert from "node:assert/strict";
import test from "node:test";
import { projectSummaryLines } from "./project-summary";
import type { ProjectProfitabilityRow } from "@/types/database";

test("project export separates contract profit from invoices and stock losses", () => {
  const report: ProjectProfitabilityRow = {
    project_code: "P-01", project_name: "Site A", contract_value: 1000, approved_budget: 800,
    material_cost: 100, labor_cost: 120, equipment_cost: 30, other_cost: 50,
    site_stock_loss_cost: 20, transfer_loss_cost: 10, total_posted_cost: 330, estimated_gross_profit: 670,
    estimated_gross_margin_percent: 67, invoiced_amount: 250, cash_received: 100, receivables: 150,
  };
  const lines = projectSummaryLines(report);
  assert.deepEqual(lines.find((line) => line.label === "Estimated gross project profit"), { label: "Estimated gross project profit", amount: 670 });
  assert.deepEqual(lines.find((line) => line.label === "Approved site stock losses"), { label: "Approved site stock losses", amount: 20 });
  assert.deepEqual(lines.find((line) => line.label === "Approved project transfer losses"), { label: "Approved project transfer losses", amount: 10 });
  assert.deepEqual(lines.find((line) => line.label === "Outstanding invoices"), { label: "Outstanding invoices", amount: 150 });
});
