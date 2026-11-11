import assert from "node:assert/strict";
import test from "node:test";
import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { RecordActionIcon } from "./record-action-menu";

test("row commands expose visible text alongside their accessible contextual names", () => {
  for (const label of ["Edit", "Archive", "Correct", "View"]) {
    const html = renderToStaticMarkup(createElement(RecordActionIcon, { label, name: "Concrete mixer", disabled: true }));
    assert.ok(html.includes(`<span>${label}</span>`));
    assert.ok(html.includes(`aria-label="${label} Concrete mixer"`));
    assert.ok(html.includes("min-h-11"));
    assert.ok(html.includes('disabled=""'));
  }
});
