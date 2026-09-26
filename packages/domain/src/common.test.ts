import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { test } from "node:test";

import { uuidSchema } from "./common";

test("every persisted seed UUID passes identifier validation", () => {
  const seed = readFileSync(new URL("../../../supabase/seed.sql", import.meta.url), "utf8");
  const ids = [...new Set(seed.match(/[0-9a-f]{8}(?:-[0-9a-f]{4}){3}-[0-9a-f]{12}/g))];
  assert.ok(ids.length > 0);
  for (const id of ids) assert.equal(uuidSchema.safeParse(id).success, true, id);
});

test("identifier validation accepts generated UUIDs but rejects malformed input", () => {
  assert.equal(uuidSchema.safeParse("01234567-89ab-4cde-8123-456789abcdef").success, true);
  for (const id of ["", "demo-project", "20000000-0000-0000-0000-00000000000", "20000000-0000-0000-0000-00000000000z", "20000000-0000-0000-0000-000000000001 OR true", " 20000000-0000-0000-0000-000000000001", null, 1]) {
    assert.equal(uuidSchema.safeParse(id).success, false);
  }
});
