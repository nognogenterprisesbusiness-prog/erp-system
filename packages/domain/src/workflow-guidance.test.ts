import assert from "node:assert/strict";
import test from "node:test";
import { dailyReportActions, dailyReportGuide, materialRequestGuide, requestDeliveryStage } from "./workflow-guidance";

const context = { status: "submitted", hasSource: false, ownRequest: false, canReview: false, canChooseSource: false, canRelease: false, canReceive: false, hasIncoming: false, hasReserved: false };
test("request guidance respects terminal states and actual capabilities", () => {
  assert.equal(materialRequestGuide({ ...context, canReview: true }).action, "review", "Admin can review multi-warehouse allocations without a default source");
  assert.equal(materialRequestGuide({ ...context, canChooseSource: true }).action, "source");
  assert.equal(materialRequestGuide({ ...context, hasSource: true, ownRequest: true }).action, null);
  for (const status of ["rejected", "cancelled", "unknown"]) assert.equal(materialRequestGuide({ ...context, status, canReview: true, canRelease: true, hasReserved: true }).action, null);
});
test("mixed deliveries offer receipt to site staff and release to warehouse staff", () => {
  const mixed = { ...context, status: "approved", hasIncoming: true, hasReserved: true };
  assert.equal(materialRequestGuide({ ...mixed, canReceive: true }).action, "receive");
  assert.equal(materialRequestGuide({ ...mixed, canRelease: true }).action, "release");
  assert.equal(materialRequestGuide(mixed).action, null);
  assert.equal(requestDeliveryStage("approved", [{ approved_quantity: 12, reserved: 6, dispatched: 6, received: 0, variance: 0 }]), "upcoming");
});
test("report guidance never offers self review or editing a submitted/approved record", () => {
  assert.equal(dailyReportGuide("submitted", true, true).action, null);
  assert.equal(dailyReportGuide("submitted", false, true).action, "review");
  assert.equal(dailyReportGuide("draft", false, true).action, null);
  assert.equal(dailyReportGuide("approved", true, true).action, null);
  assert.equal(dailyReportGuide("requires_revision", true, false).action, "correct");
  assert.equal(dailyReportActions("pending_review", false, true).canReview, false, "legacy states must not offer an action the server refuses");
  assert.equal(dailyReportGuide("rejected", true, true).action, null);
});
