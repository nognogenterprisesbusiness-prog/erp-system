import assert from "node:assert/strict";
import { test } from "node:test";

import { safeSearchTerm } from "./search";

test("search terms cannot inject PostgREST filter grammar", () => {
  assert.equal(safeSearchTerm("cement),status.eq.active,("), "cementstatuseqactive");
  assert.equal(safeSearchTerm("  Cebu Project-1  "), "Cebu Project-1");
  assert.equal(safeSearchTerm("%_,().\"\\"), "");
  assert.ok(safeSearchTerm("a".repeat(200)).length <= 80);
});
