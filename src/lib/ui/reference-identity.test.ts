import assert from "node:assert/strict";
import test from "node:test";
import { separateReferenceCode } from "./reference-identity";

test("code-first RPC labels display their name first without discarding name content", () => {
  assert.deepEqual(separateReferenceCode("26HI0024 · Compostela Gym"), { label: "Compostela Gym", secondary: "26HI0024" });
  assert.deepEqual(separateReferenceCode("BAR-01 · Steel · Grade 40"), { label: "Steel · Grade 40", secondary: "BAR-01" });
  assert.deepEqual(separateReferenceCode("Already named"), { label: "Already named" });
});
