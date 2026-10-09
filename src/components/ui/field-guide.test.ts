import assert from "node:assert/strict";
import test from "node:test";
import { getFieldGuide } from "./field-guide";

test("guidance distinguishes generated codes, unit prices, quantities and signed budget changes", () => {
  assert.match(getFieldGuide("Warehouse code")!, /WH-CEBU-01/);
  assert.match(getFieldGuide("Vehicle code")!, /Leave blank.*automatically/);
  assert.match(getFieldGuide("Unit price (PHP)")!, /one unit/);
  assert.match(getFieldGuide("Quantity (bag)")!, /material's unit/);
  assert.match(getFieldGuide("Change amount (PHP)")!, /negative reduces/);
  assert.match(getFieldGuide("Complete (%)")!, /0 to 100/);
});
test("guidance preserves free-text asset types and distinguishes sign-in from password setup", () => {
  assert.match(getFieldGuide("Equipment type")!, /Type any/);
  assert.match(getFieldGuide("Vehicle type")!, /Type any/);
  assert.match(getFieldGuide("Password")!, /for your account/);
  assert.match(getFieldGuide("New password")!, /12 to 128/);
  assert.match(getFieldGuide("Confirm new password")!, /same new password/);
});
test("search, checkbox, file and hidden controls do not receive generic entry guidance", () => {
  for (const type of ["search", "checkbox", "file", "hidden", "radio"]) {
    assert.equal(getFieldGuide("Material", { type }), undefined);
  }
  assert.match(getFieldGuide("Correction reason")!, /history/);
});
