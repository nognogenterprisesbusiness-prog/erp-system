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

import { streamCsvAttachment } from "./csv";
test("streamed exports preserve all rows beyond 1000 and escape formulas", async () => {
  async function* batches() { for (let i = 0; i < 3; i++) yield Array.from({length:500},(_,j)=>[i*500+j, "=formula"]); }
  const response = streamCsvAttachment("staff.csv", ["ID","Value"], batches());
  const value = await response.text();
  assert.equal(value.split("\r\n").length,1501);
  assert.ok(value.includes('"1499","\'=formula"'));
});
