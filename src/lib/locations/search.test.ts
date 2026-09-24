import assert from "node:assert/strict";
import { test } from "node:test";

import { searchDemoLocations } from "./search";

test("location search returns selectable municipalities with pagination", () => {
  const result = searchDemoLocations("municipalities", "cebu", "", 1, 1);
  assert.equal(result.pageSize, 1);
  assert.equal(result.items.length, 1);
  assert.equal(result.items[0].displayName, "Cebu City");
  assert.equal(result.items[0].province, "Cebu");
  assert.ok(result.total >= 1);
});

test("location search filters by province without showing sub-municipal rows", () => {
  const result = searchDemoLocations("municipalities", "", "0702200000", 1, 50);
  assert.ok(result.total > 0);
  assert.ok(result.items.every((item) => item.provinceCode === "0702200000" && item.selectable));
});
