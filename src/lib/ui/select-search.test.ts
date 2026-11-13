import assert from "node:assert/strict";
import test from "node:test";
import { searchSelectOptions } from "./select-search";

const locations = Array.from({ length: 12000 }, (_, index) => ({ value: `location-${index}`, label: `Warehouse ${index}` }));

test("large lists bound rendered matches without limiting the searchable records", () => {
  const first = searchSelectOptions(locations, "");
  assert.equal(first.visible.length, 50);
  assert.equal(first.count, 12000);
  assert.deepEqual(searchSelectOptions(locations, "warehouse 11999").visible, [locations[11999]]);
});

test("search handles case and multiple terms and preserves disabled choices", () => {
  const choices = [{ value: "a", label: "Quoit Warehouse", disabled: true }, { value: "b", label: "Quoit Project Site" }];
  assert.deepEqual(searchSelectOptions(choices, "  WAREHOUSE   quoit ").visible, [choices[0]]);
  assert.deepEqual(searchSelectOptions(choices, "unknown"), { visible: [], count: 0 });
});

test("separate name and code metadata are both searchable", () => {
  const record = { value: "gym", label: "Compostela Gym", secondary: "26HI0024" };
  assert.deepEqual(searchSelectOptions([record], "26hi0024 gym").visible, [record]);
});
