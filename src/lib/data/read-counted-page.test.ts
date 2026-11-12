import assert from "node:assert/strict";
import test from "node:test";
import { readCountedPage } from "./read-counted-page";

test("valid counted pages use one request and retain scoped totals", async () => {
  const calls: number[][] = [];
  const result = await readCountedPage((from, to) => { calls.push([from, to]); return Promise.resolve({ data: [{ id: 21 }], count: 21, error: null }); }, 2, "expenses");
  assert.deepEqual(calls, [[20, 39]]);
  assert.deepEqual(result, { data: [{ id: 21 }], count: 21, page: 2 });
});

test("out-of-range links recover once to the first page", async () => {
  const calls: number[][] = [];
  const result = await readCountedPage((from, to) => { calls.push([from, to]); return Promise.resolve(from ? { data: null, count: null, error: { code: "PGRST103", message: "Range not satisfiable" } } : { data: [{ id: 1 }], count: 1, error: null }); }, 9, "expenses");
  assert.deepEqual(calls, [[160, 179], [0, 19]]);
  assert.deepEqual(result, { data: [{ id: 1 }], count: 1, page: 1 });
});

test("permission failures and failed recovery remain errors", async () => {
  let calls = 0;
  await assert.rejects(readCountedPage(() => { calls++; return Promise.resolve({ data: null, count: null, error: { code: "42501", message: "Permission denied" } }); }, 2, "expenses"), /Unable to load expenses/);
  assert.equal(calls, 1);
  await assert.rejects(readCountedPage(() => Promise.resolve({ data: null, count: null, error: { code: "PGRST103", message: "Range not satisfiable" } }), 2, "expenses"));
});

test("empty first pages remain empty and invalid bounds never query", async () => {
  assert.deepEqual(await readCountedPage(() => Promise.resolve({ data: [], count: 0, error: null }), 1, "expenses"), { data: [], count: 0, page: 1 });
  await assert.rejects(readCountedPage(() => { throw new Error("Should not query"); }, 0, "expenses"), /Invalid database page/);
});

test("empty counted offsets normalize without a redundant request for an empty history", async () => {
  let calls = 0;
  assert.deepEqual(await readCountedPage(() => { calls++; return Promise.resolve({ data: [], count: 0, error: null }); }, 2, "history"), { data: [], count: 0, page: 1 });
  assert.equal(calls, 1);
  const recovered = await readCountedPage(from => Promise.resolve({ data: from ? [] : [{ id: 1 }], count: 1, error: null }), 2, "history");
  assert.deepEqual(recovered, { data: [{ id: 1 }], count: 1, page: 1 });
});
