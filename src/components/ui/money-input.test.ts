import assert from "node:assert/strict";
import { test } from "node:test";
import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { MoneyInput } from "./money-input";

test("money inputs display grouping but submit one exact ungrouped amount", () => {
  const html = renderToStaticMarkup(createElement(MoneyInput, { name: "amount", defaultValue: "722222000.00", required: true }));
  assert.match(html, /type="text"[^>]*value="722,222,000.00"/);
  assert.match(html, /type="hidden" name="amount" value="722222000.00"/);
  assert.equal((html.match(/name="amount"/g) ?? []).length, 1);
  assert.match(html, /inputMode="decimal"/);
});

test("controlled amounts reflect externally recalculated values and disabled fields are not submitted", () => {
  const html = renderToStaticMarkup(createElement(MoneyInput, { name: "goodsTotalCost", value: "12345.60", disabled: true }));
  assert.match(html, /value="12,345.60"/);
  assert.match(html, /type="hidden" disabled="" name="goodsTotalCost" value="12345.60"/);
  assert.match(renderToStaticMarkup(createElement(MoneyInput, { name: "amount", defaultValue: "" })), /type="hidden" name="amount" value=""/);
});
