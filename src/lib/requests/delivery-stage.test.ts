import assert from "node:assert/strict";
import { test } from "node:test";
import { requestDeliveryStage } from "./delivery-stage";
const line = { approved_quantity: 10, reserved: 0, dispatched: 0, received: 0, variance: 0 };
test("request delivery labels distinguish reservation, transit, partial acceptance and approved loss", () => {
  assert.equal(requestDeliveryStage("submitted", [{ ...line, reserved: 10 }]), null);
  assert.equal(requestDeliveryStage("approved", [{ ...line, reserved: 10 }]), "ready");
  assert.equal(requestDeliveryStage("approved", [{ ...line, dispatched: 10 }]), "upcoming");
  assert.equal(requestDeliveryStage("approved", [{ ...line, dispatched: 10, received: 4 }]), "partial");
  assert.equal(requestDeliveryStage("approved", [{ ...line, dispatched: 10, received: 10 }]), "received");
  assert.equal(requestDeliveryStage("approved", [{ ...line, dispatched: 10, received: 8, variance: 2 }]), "settled");
  assert.equal(requestDeliveryStage("cancelled", [{ ...line, reserved: 10 }]), null);
});
test("different units and fractional receipts do not produce false delivery completion", () => {
  assert.equal(requestDeliveryStage("partially_approved", [{ ...line, received: 10, dispatched: 10 }, { ...line, approved_quantity: 0 }]), "received");
  assert.equal(requestDeliveryStage("approved", [{ ...line, received: 10, dispatched: 10 }, { ...line, reserved: 10 }]), "partial");
  assert.equal(requestDeliveryStage("approved", [{ ...line, approved_quantity: 0.3, dispatched: 0.3, received: 0.1, variance: 0.2 }]), "settled");
  assert.equal(requestDeliveryStage("approved", []), null);
});
