import assert from "node:assert/strict";
import { test } from "node:test";
import { pageNumber } from "./pagination";
test("pagination normalizes untrusted page parameters", () => {
  for (const input of [undefined, "no", "0", "-1", "1.5", Infinity]) assert.equal(pageNumber(input), 1);
  assert.equal(pageNumber("51"), 51);
  assert.equal(pageNumber("100000"), 10000);
});
