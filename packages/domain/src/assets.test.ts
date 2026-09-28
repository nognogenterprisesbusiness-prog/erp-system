import assert from "node:assert/strict";
import { test } from "node:test";

import { assetChoiceLabel, vehicleTag } from "./assets";

test("asset pickers mark vehicles and leave equipment unchanged", () => {
  assert.equal(assetChoiceLabel({ code: "EQ-001", name: "Excavator", kind: "equipment" }), "EQ-001 · Excavator");
  assert.equal(assetChoiceLabel({ code: "VH-001", name: "Dump truck", kind: "vehicle" }), "VH-001 · Dump truck · Vehicle");
  assert.equal(vehicleTag(undefined), "");
});
