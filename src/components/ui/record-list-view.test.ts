import assert from "node:assert/strict";
import { test } from "node:test";
import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { RecordListView } from "./record-list-view";

test("list view initially renders cards with accessible view controls", () => {
  const markup = renderToStaticMarkup(createElement(RecordListView, {
    storageKey: "projects", title: "Projects", columns: ["Name"], rows: [{ id: "one", cells: ["Table project"] }],
  }, createElement("article", null, "Card project")));
  assert.match(markup, /aria-label="Projects view"/);
  assert.match(markup, /aria-pressed="true"[^>]*>Cards/);
  assert.match(markup, /aria-pressed="false"[^>]*>Table/);
  assert.match(markup, /Card project/);
  assert.doesNotMatch(markup, /Table project/);
});
test("empty lists preserve their existing empty state", () => {
  const markup = renderToStaticMarkup(createElement(RecordListView, {
    storageKey: "inventory", title: "Inventory", columns: ["Material"], rows: [],
  }, createElement("p", null, "No inventory records")));
  assert.match(markup, /No inventory records/);
  assert.doesNotMatch(markup, /<table/);
});
