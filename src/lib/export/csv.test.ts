import assert from "node:assert/strict";
import { test } from "node:test";

import { encodeCsv } from "./csv";

test("CSV export quotes cells and neutralizes spreadsheet formulas", () => {
  const csv = encodeCsv(["Name", "Count"], [["Portland, cement", 12], ["=HYPERLINK(\"bad\")", 2], ["\n+SUM(1,2)", -3]]);
  assert.match(csv, /^\uFEFF"Name","Count"/);
  assert.match(csv, /"Portland, cement","12"/);
  assert.match(csv, /"'=HYPERLINK\(""bad""\)","2"/);
  assert.match(csv, /"' \+SUM\(1,2\)","-3"/);
});
