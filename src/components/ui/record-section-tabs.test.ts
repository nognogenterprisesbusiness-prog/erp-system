import assert from "node:assert/strict";
import test from "node:test";
import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { RecordSectionTabs } from "./record-section-tabs";

test("record sections expose one active panel while retaining inactive form content", () => {
  const html = renderToStaticMarkup(createElement(RecordSectionTabs, { initialSection: "details", sections: [
    { id: "expenses", label: "Expenses", content: createElement("input", { name: "requestId", defaultValue: "same-retry-key" }) },
    { id: "details", label: "Details", content: "Unit details" },
  ] }));
  assert.equal((html.match(/role="tab"/g) ?? []).length, 2);
  assert.equal((html.match(/aria-selected="true"/g) ?? []).length, 1);
  assert.match(html, /role="tabpanel"[^>]*expenses-panel[^>]*hidden=""/);
  assert.match(html, /name="requestId"[^>]*value="same-retry-key"/);
  assert.match(html, /aria-controls="[^"]+details-panel"/);
  assert.doesNotMatch(html, /href="#/);
});

test("unknown sections fall back to a permitted section and empty sections render nothing", () => {
  const html = renderToStaticMarkup(createElement(RecordSectionTabs, { initialSection: "expenses", sections: [{ id: "details", label: "Details", content: "Permitted details" }] }));
  assert.match(html, /aria-selected="true"/);
  assert.doesNotMatch(html, />Expenses</);
  assert.equal(renderToStaticMarkup(createElement(RecordSectionTabs, { initialSection: "details", sections: [] })), "");
});
