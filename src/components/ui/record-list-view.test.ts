import assert from "node:assert/strict";
import { test } from "node:test";
import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { RecordListView, RecordListViewToggle, RecordListViewProvider, RecordListSkeleton } from "./record-list-view";

test("filter-row switch has accessible non-submit buttons", () => {
  const markup = renderToStaticMarkup(createElement(RecordListViewProvider, { initialPreferences: { projects: "cards" } },
    createElement(RecordListViewToggle, { storageKey: "projects", title: "Projects" })));
  assert.match(markup, /aria-label="Projects view"/);
  assert.match(markup, /aria-pressed="true"[^>]*>Cards/);
  assert.match(markup, /aria-pressed="false"[^>]*>Table/);
  assert.equal((markup.match(/type="button"/g) ?? []).length, 2);
});

test("a saved card preference renders cards without a duplicate toolbar", () => {
  const markup = renderToStaticMarkup(createElement(RecordListViewProvider, { initialPreferences: { projects: "cards" } }, createElement(RecordListView, {
    storageKey: "projects", title: "Projects", columns: ["Name"], rows: [{ id: "one", cells: ["Table project"] }],
  }, createElement("article", null, "Card project"))));
  assert.doesNotMatch(markup, /aria-label="Projects view"/);
  assert.match(markup, /Card project/);
  assert.doesNotMatch(markup, /Table project/);
});

test("saved table preferences render the table and matching loading state before hydration", () => {
  const markup = renderToStaticMarkup(createElement(RecordListViewProvider, { initialPreferences: { inventory: "table" } },
    createElement(RecordListView, { storageKey: "inventory", title: "Inventory", columns: ["Material"], rows: [{ id: "one", cells: ["Table material"] }] },
      createElement("article", null, "Card material"))));
  assert.match(markup, /<table/);
  assert.match(markup, /Table material/);
  assert.doesNotMatch(markup, /Card material/);
  const skeleton = renderToStaticMarkup(createElement(RecordListViewProvider, { initialPreferences: { inventory: "table" } },
    createElement(RecordListSkeleton, { storageKey: "inventory" })));
  assert.doesNotMatch(skeleton, /h-64/);
  const toggle = renderToStaticMarkup(createElement(RecordListViewProvider, { initialPreferences: { inventory: "table" } },
    createElement(RecordListViewToggle, { storageKey: "inventory", title: "Inventory" })));
  assert.match(toggle, /aria-pressed="true"[^>]*>Table/);
});

test("a legacy browser preference is restored without a server-rendered card flash", () => {
  const markup = renderToStaticMarkup(createElement(RecordListView, {
    storageKey: "inventory", title: "Inventory", columns: ["Material"], rows: [{ id: "one", cells: ["Table material"] }],
  }, createElement("article", null, "Card material")));
  assert.match(markup, /Loading saved view/);
  assert.doesNotMatch(markup, /Card material|Table material/);
});
test("empty lists preserve their existing empty state", () => {
  const markup = renderToStaticMarkup(createElement(RecordListView, {
    storageKey: "inventory", title: "Inventory", columns: ["Material"], rows: [],
  }, createElement("p", null, "No inventory records")));
  assert.match(markup, /No inventory records/);
  assert.doesNotMatch(markup, /<table/);
});
