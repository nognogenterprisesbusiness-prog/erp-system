import assert from "node:assert/strict";
import { test } from "node:test";
import { parseRecordViewPreferences, updateRecordViewPreferences } from "./record-view-preferences";

test("view cookies keep independent page choices across reloads", () => {
  const first = updateRecordViewPreferences(undefined, "inventory", "table");
  const next = updateRecordViewPreferences(first, "projects", "cards");
  assert.deepEqual(parseRecordViewPreferences(next), { inventory: "table", projects: "cards" });
  assert.deepEqual(parseRecordViewPreferences(updateRecordViewPreferences(next, "inventory", "cards")), { projects: "cards", inventory: "cards" });
});

test("malformed and oversized preference cookies fail safely without injecting properties", () => {
  for (const value of [undefined, "bad", "%ZZ", "[]", "null", "x".repeat(3501)]) assert.deepEqual(parseRecordViewPreferences(value), {});
  assert.deepEqual(parseRecordViewPreferences(encodeURIComponent('{"inventory":"table","invalid":"grid","__proto__":"table","constructor":"cards"}')), { inventory: "table" });
  let cookie: string | undefined;
  for (let index = 0; index < 40; index++) cookie = updateRecordViewPreferences(cookie, `page-${index}`, "table");
  assert.equal(Object.keys(parseRecordViewPreferences(cookie)).length, 32);
});
