import assert from "node:assert/strict";
import test from "node:test";
import { projectCostCategories } from "./cost-breakdown";

test("detailed costs preserve centavos and do not count labour/equipment receipts twice", () => {
  const categories = projectCostCategories("project", { material_cost: 100.10, labor_cost: 250, equipment_cost: 400, site_stock_loss_cost: 5, transfer_loss_cost: 2 }, [
    { bucket: "labor", amount: 50, entry_count: 1 }, { bucket: "equipment", amount: 100, entry_count: 1 },
    { bucket: "permit", amount: 125.25, entry_count: 2 }, { bucket: "fuel", amount: 75.75, entry_count: 1 },
  ]);
  assert.equal(categories.reduce((sum, entry) => sum + entry.amountCentavos, 0), 95810);
  assert.equal(categories.find((entry) => entry.label === "Vehicle fuel")?.href, "/projects/project/costs?expense=fuel#expense-history");
  assert.equal(categories.filter((entry) => entry.label.includes("receipts")).length, 0);
});
