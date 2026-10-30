import assert from "node:assert/strict";
import test from "node:test";
import { chartScale, monthPosition } from "./geometry";

test("chart scales retain zero, fractional quantities and negative net costs", () => {
  for (const values of [[], [0, 0], [0.0001, 0.0002], [150, 4200], [-300, 120], [-50, -10]]) {
    const { minimum, maximum } = chartScale(values);
    assert.ok(maximum > minimum);
    assert.ok(minimum <= 0 && maximum >= 0);
    for (const value of values) assert.ok(value >= minimum && value <= maximum);
  }
  assert.ok(chartScale([0.0001, 0.0002]).maximum < 0.001, "Small stock quantities must not appear flat on a whole-unit axis");
});

test("a single month is centered and multiple months span the plot endpoints", () => {
  assert.equal(monthPosition(0, 1, 60, 620), 340);
  assert.equal(monthPosition(0, 6, 60, 620), 60);
  assert.equal(monthPosition(5, 6, 60, 620), 620);
});
