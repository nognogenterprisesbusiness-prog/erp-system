import assert from "node:assert/strict";
import test from "node:test";
import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { FormField } from "./form-field";
import { Input } from "./input";
import { getFieldPlaceholder } from "./field-placeholder";

test("examples render inside empty fields without becoming submitted values or extra paragraphs", () => {
  for (const [label, expected] of [["Contact number", "09150365602"], ["Full name", "Rich Manoloy"], ["Warehouse code", "WH-CEBU-01"]]) {
    const html = renderToStaticMarkup(FormField({ label, htmlFor: "example", children: createElement(Input, { id: "example", name: "example" }) }));
    assert.match(html, new RegExp(`placeholder="${expected}"`));
    assert.doesNotMatch(html, /value=|Example:|<p|leading-5/);
  }
});
test("examples preserve entered values, field errors and non-text controls", () => {
  const html = renderToStaticMarkup(FormField({ label: "Warehouse code", htmlFor: "code", error: "Code already exists", children: createElement("input", { id: "code", name: "code", defaultValue: "WH-MNL-02" }) }));
  assert.match(html, /value="WH-MNL-02"/);
  assert.match(html, /role="alert"[^>]*>Code already exists/);
  for (const type of ["hidden", "checkbox", "radio", "file", "search", "date", "time"]) assert.equal(getFieldPlaceholder("Contact number", { type }), undefined);
});
test("numeric and free-text examples follow the field meaning", () => {
  assert.equal(getFieldPlaceholder("Quantity (bag)"), "100");
  assert.equal(getFieldPlaceholder("Change amount (PHP)"), "-500.00");
  assert.equal(getFieldPlaceholder("Complete (%)"), "25");
  assert.equal(getFieldPlaceholder("Equipment type"), "Concrete mixer");
  assert.equal(getFieldPlaceholder("Vehicle type"), "Dump truck");
});

test("approval fields retain their explicit guidance instead of a generic correction example", () => {
  const html = renderToStaticMarkup(FormField({ label: "Reason for the approved change", htmlFor: "approval", children: createElement("textarea", { id: "approval", placeholder: "Approved additional second-floor work" }) }));
  assert.match(html, /placeholder="Approved additional second-floor work"/);
  assert.doesNotMatch(html, /Incorrect details recorded/);
});

test("field labels stay separate from guidance and errors describe the control", () => {
  const html = renderToStaticMarkup(FormField({ label: "Quantity", htmlFor: "quantity", error: "Enter an available quantity", children: createElement("input", { id: "quantity", required: true }) }));
  assert.match(html, /<label for="quantity">Quantity<\/label>/);
  assert.match(html, /aria-describedby="quantity-error"/);
  assert.match(html, /aria-invalid="true"/);
  assert.match(html, /id="quantity-error" role="alert"/);
});
