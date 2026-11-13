import assert from "node:assert/strict";
import test from "node:test";
import { projectCostCategories } from "./cost-breakdown";

test("detailed costs preserve centavos and do not count labour/equipment receipts twice", () => {
  const categories = projectCostCategories("project", { material_cost: 100.10, labor_cost: 250, equipment_cost: 400, site_stock_loss_cost: 5, transfer_loss_cost: 2 }, [
    { bucket: "labor", amount: 50, entry_count: 1 }, { bucket: "equipment", amount: 100, entry_count: 1 },
    { bucket: "permit", amount: 125.25, entry_count: 2 }, { bucket: "fuel", amount: 75.75, entry_count: 1 },
  ]);
  assert.equal(categories.reduce((sum, entry) => sum + entry.amountCentavos, 0), 95810);
  assert.equal(categories.find((entry) => entry.label === "Vehicle fuel")?.href, "/projects/project?tab=finance&expense=fuel#expense-history");
  assert.equal(categories.filter((entry) => entry.label.includes("receipts")).length, 0);
});

test("cost drilldowns keep the project and expense type and expose both combined sources", () => {
  const categories = projectCostCategories("project-123", { material_cost: 100, labor_cost: 200, equipment_cost: 300, site_stock_loss_cost: 0, transfer_loss_cost: 0 }, [
    { bucket: "labor", amount: 50, entry_count: 1 }, { bucket: "equipment", amount: 75, entry_count: 1 }, { bucket: "site_receipt", amount: 125, entry_count: 1 },
  ]);
  assert.equal(categories.find(item => item.label === "Materials used")?.href, "/projects/project-123?tab=materials#material-consumption");
  assert.equal(categories.find(item => item.label === "Labour")?.href, "/projects/project-123/attendance");
  assert.deepEqual(categories.find(item => item.label === "Labour")?.relatedLinks, [{ label: "View labour receipts", href: "/projects/project-123?tab=finance&expense=labor#expense-history" }]);
  assert.deepEqual(categories.find(item => item.label === "Equipment & vehicles")?.relatedLinks, [{ label: "View equipment receipts", href: "/projects/project-123?tab=finance&expense=equipment#expense-history" }]);
  assert.equal(categories.find(item => item.label === "Site receipt expenses")?.href, "/projects/project-123?tab=finance&expense=site_receipt#expense-history");
  assert.equal(categories.reduce((sum, item) => sum + item.amountCentavos, 0), 72500);
});
