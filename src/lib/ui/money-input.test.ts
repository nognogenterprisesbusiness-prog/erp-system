import { strict as assert } from "node:assert";
import { test } from "node:test";
import { groupMoney, moneyCaret, ungroupMoney } from "./money-input";

test("money grouping preserves exact amounts and decimals", () => {
  for (const [raw, grouped] of [["722222000.00", "722,222,000.00"], ["0.01", "0.01"], ["99999999999.99", "99,999,999,999.99"], ["1234.", "1,234."], ["", ""], ["0", "0"], ["1234.567", "1,234.567"]]) {
    assert.equal(groupMoney(raw), grouped);
    assert.equal(ungroupMoney(grouped), raw);
  }
});
test("money input keeps invalid text visible instead of silently changing its value", () => {
  for (const raw of ["1e3", "-10", "abc", "12.3.4"]) assert.equal(groupMoney(raw), raw);
});
test("grouped pasted values remain stable and editing caret ignores separators", () => {
  assert.equal(groupMoney("722,222,000.00"), "722,222,000.00");
  assert.equal(moneyCaret("1,234.50", 0), 0);
  assert.equal(moneyCaret("1,234.50", 2), 3);
  assert.equal(moneyCaret("1,234.50", 7), 8);
});
