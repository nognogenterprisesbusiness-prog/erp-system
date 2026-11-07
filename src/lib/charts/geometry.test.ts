import assert from "node:assert/strict";
import test from "node:test";
import { monthBands, niceTicks, ringSegment, stackSegments } from "./geometry";

test("custom ring sectors keep very small and large cost shares finite", () => {
  for (const [start, end] of [[0, 0.00001], [0.1, 1], [0.1, 5.9]]) {
    const path = ringSegment(start, end);
    assert.ok(path.endsWith(" Z"));
    assert.doesNotMatch(path, /NaN|Infinity/);
  }
});

test("month bands split the plot evenly and keep bars inside their band", () => {
  const bands = monthBands(6, 48, 648);
  assert.equal(bands.band, 100);
  assert.equal(bands.center(0), 98);
  assert.equal(bands.center(5), 598);
  assert.ok(bands.width < bands.band);
  assert.equal(monthBands(1, 48, 648).center(0), 348);
  assert.ok(monthBands(40, 48, 248).width >= 4, "Many months stay visible");
});

test("stacked bars keep each category value and ignore negative or invalid input", () => {
  assert.deepEqual(stackSegments([636.23, 1600, 0, 1250]).map((segment) => [segment.from, segment.to]), [[0, 636.23], [636.23, 2236.23], [2236.23, 2236.23], [2236.23, 3486.23]]);
  assert.deepEqual(stackSegments([-5, Number.NaN, 2]).map((segment) => segment.value), [0, 0, 2]);
});

test("axis ticks use round steps that cover the tallest bar", () => {
  assert.deepEqual(niceTicks(4086.23), [0, 2000, 4000, 6000]);
  assert.deepEqual(niceTicks(3486.23), [0, 1000, 2000, 3000, 4000]);
  assert.deepEqual(niceTicks(6), [0, 2, 4, 6]);
  assert.deepEqual(niceTicks(0), [0, 0.25, 0.5, 0.75, 1]);
  assert.deepEqual(niceTicks(0.0003), [0, 0.0001, 0.0002, 0.0003]);
  for (const max of [1, 7, 99, 1234.5, 987654]) { const ticks = niceTicks(max); assert.ok(ticks.at(-1)! >= max && ticks.length <= 6, String(max)); }
});
