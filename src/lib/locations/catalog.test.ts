import assert from "node:assert/strict";
import { test } from "node:test";

import catalog from "./catalog.json";

test("supplied location catalog has stable codes and valid hierarchy", () => {
  assert.equal(catalog.regions.length, 17);
  assert.equal(catalog.provinces.length, 82);
  assert.equal(catalog.municipalities.length, 1656);
  assert.equal(catalog.barangays.length, 100);
  const regionCodes = new Set(catalog.regions.map((row) => row.code));
  const provinceCodes = new Set(catalog.provinces.map((row) => row.code));
  const municipalityCodes = new Set(catalog.municipalities.map((row) => row.code));
  for (const row of catalog.provinces) assert.ok(regionCodes.has(row.regionCode));
  for (const row of catalog.municipalities) {
    assert.ok(regionCodes.has(row.regionCode));
    if (row.provinceCode) assert.ok(provinceCodes.has(row.provinceCode));
  }
  for (const row of catalog.barangays) assert.ok(municipalityCodes.has(row.municipalityCode));
  assert.equal(catalog.municipalities.find((row) => row.code === "0730600000")?.displayName, "Cebu City");
  const manila = catalog.municipalities.find((row) => row.code === "1380600000");
  assert.equal(manila?.province, "Metro Manila");
  assert.equal(manila?.provinceCode, null);
  assert.equal(catalog.municipalities.find((row) => row.code === "1380602000")?.selectable, false);
});
