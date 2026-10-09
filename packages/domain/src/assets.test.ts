import assert from "node:assert/strict";
import { test } from "node:test";

import { assetCategoryInputSchema, assetChoiceLabel, vehicleInputSchema, vehicleTag } from "./assets";

test("asset pickers mark vehicles and leave equipment unchanged", () => {
  assert.equal(assetChoiceLabel({ code: "EQ-001", name: "Excavator", kind: "equipment" }), "EQ-001 · Excavator");
  assert.equal(assetChoiceLabel({ code: "VH-001", name: "Dump truck", kind: "vehicle" }), "VH-001 · Dump truck · Vehicle");
  assert.equal(vehicleTag(undefined), "");
});

const vehicle = {
  code: "", name: "Delivery truck", vehicleType: "6-wheel concrete mixer",
  plateNumber: "ABC 9876", currentLocationId: "81000000-0000-0000-0000-000000000001",
  ownershipType: "company_owned", status: "available", conditionNotes: "",
};

test("vehicle entry accepts free text and automatic code without detailed catalog fields", () => {
  const parsed = vehicleInputSchema.parse(vehicle);
  assert.equal(parsed.vehicleType, "6-wheel concrete mixer");
  assert.equal(parsed.code, "");
  assert.equal(vehicleInputSchema.safeParse({ ...vehicle, vehicleType: "Pickup / service van" }).success, true);
});

test("vehicle entry requires identification and location and rejects custody-managed statuses", () => {
  for (const invalid of [{ vehicleType: " " }, { plateNumber: "" }, { currentLocationId: "" }, { code: "A" }, { status: "assigned" }, { status: "in_use" }, { status: "retired" }]) {
    assert.equal(vehicleInputSchema.safeParse({ ...vehicle, ...invalid }).success, false);
  }
});

test("classifications apply to equipment while vehicle types are free text", () => {
  assert.equal(assetCategoryInputSchema.safeParse({ assetKind: "equipment", name: "Power tools" }).success, true);
  assert.equal(assetCategoryInputSchema.safeParse({ assetKind: "vehicle", name: "Trucks" }).success, false);
});
