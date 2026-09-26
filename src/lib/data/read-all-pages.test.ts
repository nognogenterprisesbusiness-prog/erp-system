import assert from "node:assert/strict";
import { test } from "node:test";
import { readAllPages, readByIds } from "./read-all-pages";

test("reads all rows beyond the API's default 1,000-row limit", async () => {
  const source = Array.from({ length: 1205 }, (_, id) => ({ id }));
  const ranges: string[] = [];
  const rows = await readAllPages((from, to) => {
    ranges.push(`${from}-${to}`);
    return Promise.resolve({ data: source.slice(from, to + 1), error: null });
  }, "test rows");
  assert.deepEqual(rows, source);
  assert.deepEqual(ranges, ["0-499", "500-999", "1000-1499"]);
});

test("does not silently return partial results when a later page fails", async () => {
  await assert.rejects(readAllPages((from) => Promise.resolve(from === 0
    ? { data: [{ id: 1 }], error: null }
    : { data: null, error: { message: "database unavailable" } }), "test rows", 1));
});

test("resolves reference IDs in bounded chunks", async () => {
  const ids = Array.from({ length: 235 }, (_, id) => String(id));
  const lengths: number[] = [];
  const rows = await readByIds(ids, (batch, from, to) => {
    lengths.push(batch.length);
    return Promise.resolve({ data: batch.slice(from, to + 1), error: null });
  }, "references");
  assert.deepEqual(rows.map((row) => row), ids);
  assert.deepEqual(lengths, [100, 100, 35]);
});
