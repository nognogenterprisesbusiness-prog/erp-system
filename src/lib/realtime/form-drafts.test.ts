import assert from "node:assert/strict";
import test from "node:test";
import { FormDrafts } from "./form-drafts";

test("server updates alone are not treated as unsaved user input", () => {
  const drafts = new FormDrafts<string>();
  drafts.observe("approval", "10");
  assert.equal(drafts.hasChanges(new Map([["approval", "8"]])), false);
});
test("an inline draft, including changed hidden warehouse allocations, defers refresh", () => {
  const drafts = new FormDrafts<string>();
  drafts.observe("approval", "warehouseA:10");
  drafts.touch("approval", "warehouseA:10");
  assert.equal(drafts.hasChanges(new Map([["approval", "warehouseB:10"]])), true);
  assert.equal(drafts.hasChanges(new Map([["approval", "warehouseB:10"]])), true);
});
test("saving one form does not discard another form's draft", () => {
  const drafts = new FormDrafts<string>();
  drafts.observe("a", "1"); drafts.observe("b", "1");
  drafts.touch("a", "1"); drafts.touch("b", "1");
  drafts.saved("a", "2");
  assert.equal(drafts.hasChanges(new Map([["a", "2"], ["b", "2"]])), true);
  drafts.saved("b", "2");
  assert.equal(drafts.hasChanges(new Map([["a", "2"], ["b", "2"]])), false);
});
test("closing a form or reverting its input allows queued refreshes", () => {
  const drafts = new FormDrafts<string>();
  drafts.observe("a", "1"); drafts.touch("a", "1");
  assert.equal(drafts.hasChanges(new Map([["a", "2"]])), true);
  assert.equal(drafts.hasChanges(new Map([["a", "1"]])), false);
  drafts.touch("a", "1");
  assert.equal(drafts.hasChanges(new Map()), false);
});
