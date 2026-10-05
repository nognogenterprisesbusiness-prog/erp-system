import assert from "node:assert/strict";
import test from "node:test";
import { getPurchaseWorkflow } from "./workflow";

const admin = { canManage: true, canViewFinance: true };
const finance = { canManage: false, canViewFinance: true };
const operational = { canManage: false, canViewFinance: false };

test("received purchases enter Supplier Payment without implying they are paid", () => {
  const purchase = { source: "purchase_order", delivery_stage: "received", payment_stage: "unpaid" } as const;
  assert.equal(getPurchaseWorkflow(purchase, finance, 360).label, "Supplier Payment");
  assert.equal(getPurchaseWorkflow(purchase, finance, 360).action, "payment");
  assert.equal(getPurchaseWorkflow({ ...purchase, payment_stage: "paid" }, admin, 0).action, "history");
  assert.equal(getPurchaseWorkflow(purchase, finance, 0).action, "history", "a concurrently paid balance cannot open another payment form");
  assert.equal(getPurchaseWorkflow(purchase, operational, 360).action, "view");
});

test("partial delivery offers Admin receipt and Finance payment without widening receiving access", () => {
  const purchase = { source: "purchase_order", delivery_stage: "partly_received", payment_stage: "partly_paid" } as const;
  assert.equal(getPurchaseWorkflow(purchase, admin, 200).label, "Inventory Receipt");
  assert.equal(getPurchaseWorkflow(purchase, admin, 200).action, "receive");
  assert.equal(getPurchaseWorkflow(purchase, finance, 200).action, "payment");
  assert.equal(getPurchaseWorkflow(purchase, operational, 200).action, "view");
});

test("site purchase actions route to review and keep reimbursement distinct from supplier payment", () => {
  const submitted = { source: "site_purchase", delivery_stage: "waiting_approval", payment_stage: "none" } as const;
  assert.equal(getPurchaseWorkflow(submitted, finance, null).action, "review");
  assert.equal(getPurchaseWorkflow(submitted, operational, null).action, "view");
  const purchase = { source: "site_purchase", delivery_stage: "received", payment_stage: "to_reimburse" } as const;
  assert.equal(getPurchaseWorkflow(purchase, finance, null).label, "Reimbursement");
  assert.equal(getPurchaseWorkflow(purchase, finance, null).action, "reimburse");
  assert.equal(getPurchaseWorkflow({ ...purchase, payment_stage: "paid" }, finance, null).action, "history");
});

test("cancelled and rejected records never expose posting actions", () => {
  for (const delivery_stage of ["cancelled", "rejected"] as const) {
    const purchase = { source: "purchase_order", delivery_stage, payment_stage: "unpaid" } as const;
    assert.equal(getPurchaseWorkflow(purchase, admin, 1000).action, "view");
    assert.equal(getPurchaseWorkflow(purchase, admin, 1000).terminal, true);
  }
});
