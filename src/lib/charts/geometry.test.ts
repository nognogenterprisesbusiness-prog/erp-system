import assert from "node:assert/strict";
import test from "node:test";
import { chartScale, monthPosition, monotonePath, ringSegment } from "./geometry";

test("chart scales retain zero, fractional quantities and negative net costs", () => {
  for (const values of [[], [0, 0], [0.0001, 0.0002], [150, 4200], [-300, 120], [-50, -10]]) {
    const { minimum, maximum } = chartScale(values);
    assert.ok(maximum > minimum);
    assert.ok(minimum <= 0 && maximum >= 0);
    for (const value of values) assert.ok(value >= minimum && value <= maximum);
  }
  assert.ok(chartScale([0.0001, 0.0002]).maximum < 0.001, "Small stock quantities must not appear flat on a whole-unit axis");
});

test("custom curves pass through every sample without adding peaks or negative stock", () => {
  for (const values of [[0, 0, 6, 0, 0], [2, 8, 4, 12, 1], [-5, -3, 0, 3, 9], [0.0001, 0.0002, 0.0001]]) {
    const points = values.map((value, index) => [index * 100, value] as const);
    const path = monotonePath(points);
    const segments = [...path.matchAll(/C([^C]+)/g)];
    assert.equal(segments.length, points.length - 1);
    segments.forEach((segment, index) => {
      const [c1x, c1y, c2x, c2y, endX, endY] = segment[1].trim().split(/[ ,]+/).map(Number);
      assert.equal(endX, points[index + 1][0]);
      assert.equal(endY, points[index + 1][1]);
      assert.ok(c1x >= points[index][0] && c2x <= endX);
      for (let sample = 0; sample <= 100; sample++) {
        const t = sample / 100, inverse = 1 - t;
        const value = inverse ** 3 * points[index][1] + 3 * inverse ** 2 * t * c1y + 3 * inverse * t ** 2 * c2y + t ** 3 * endY;
        assert.ok(value >= Math.min(points[index][1], endY) - 1e-10 && value <= Math.max(points[index][1], endY) + 1e-10);
      }
    });
  }
  assert.equal(monotonePath([]), "");
  assert.equal(monotonePath([[10, 20]]), "M10,20");
  assert.equal(monotonePath([[10, 20], [30, 40]]), "M10,20 L30,40");
});

test("custom ring sectors keep very small and large cost shares finite", () => {
  for (const [start, end] of [[0, 0.00001], [0.1, 1], [0.1, 5.9]]) {
    const path = ringSegment(start, end);
    assert.ok(path.endsWith(" Z"));
    assert.doesNotMatch(path, /NaN|Infinity/);
  }
});

test("a single month is centered and multiple months span the plot endpoints", () => {
  assert.equal(monthPosition(0, 1, 60, 620), 340);
  assert.equal(monthPosition(0, 6, 60, 620), 60);
  assert.equal(monthPosition(5, 6, 60, 620), 620);
});
