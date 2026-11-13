import assert from "node:assert/strict";
import { test } from "node:test";

import { safeSearchTerm } from "./search";

test("search terms cannot inject PostgREST filter grammar", () => {
  assert.equal(safeSearchTerm("cement),status.eq.active,("), "cementstatuseqactive");
  assert.equal(safeSearchTerm("  Cebu Project-1  "), "Cebu Project-1");
  assert.equal(safeSearchTerm("%_,().\"\\"), "");
  assert.ok(safeSearchTerm("a".repeat(200)).length <= 80);
});

import { safeAccountSearchTerm } from "./search";
test("account search preserves email punctuation without filter operators", () => {
  assert.equal(safeAccountSearchTerm(" admin@nognog.local "), "admin@nognog.local");
  assert.equal(safeAccountSearchTerm("worker_name@example.com"), "worker_name@example.com");
  assert.equal(safeAccountSearchTerm("x),is_active.eq.false"), "xis_active.eq.false");
  assert.equal(safeAccountSearchTerm("a".repeat(1000)).length, 80);
});
