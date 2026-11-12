import assert from "node:assert/strict";
import test from "node:test";
import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { RecordActionIcon, RecordActionMenu } from "./record-action-menu";

test("row commands expose visible text alongside their accessible contextual names", () => {
  for (const label of ["Edit", "Archive", "Correct", "View"]) {
    const html = renderToStaticMarkup(createElement(RecordActionIcon, { label, name: "Concrete mixer", disabled: true }));
    assert.ok(html.includes(`<span>${label}</span>`));
    assert.ok(html.includes(`aria-label="${label} Concrete mixer"`));
    assert.ok(html.includes("min-h-11"));
    assert.ok(html.includes('disabled=""'));
  }
});

test("View stays visible while two or more actions use an icon-only menu", () => {
  const viewOnly = renderToStaticMarkup(createElement(RecordActionMenu, { name: "Truck", actions: [{ label: "View", href: "/vehicles/truck" }] }));
  assert.match(viewOnly, /<span>View<\/span>/);
  assert.doesNotMatch(viewOnly, /aria-haspopup|<svg/);
  const withEdit = renderToStaticMarkup(createElement(RecordActionMenu, { name: "Truck", actions: [{ label: "View", href: "/vehicles/truck" }, { label: "Edit", href: "/vehicles/truck?edit=1" }] }));
  assert.match(withEdit, /<span>View<\/span>/);
  assert.match(withEdit, /aria-label="Actions for Truck"/);
  assert.match(withEdit, /aria-haspopup="menu"/);
  assert.doesNotMatch(withEdit, /<span>(Actions|Edit)<\/span>/);
  const secondary = renderToStaticMarkup(createElement(RecordActionMenu, { name: "Document", actions: [{ label: "Edit" }, { label: "Delete" }] }));
  assert.equal((secondary.match(/<button/g) ?? []).length, 1);
  assert.doesNotMatch(secondary, /<span>(Edit|Delete|Actions)<\/span>/);
});

test("native file viewing keeps its target and does not route through the app shell", () => {
  const html = renderToStaticMarkup(createElement(RecordActionIcon, { label: "View", name: "Plan", href: "/project-documents/file?view=1", native: true, target: "_blank" }));
  assert.match(html, /target="_blank"/);
  assert.match(html, /rel="noopener noreferrer"/);
  assert.doesNotMatch(html, /<svg/);
});
