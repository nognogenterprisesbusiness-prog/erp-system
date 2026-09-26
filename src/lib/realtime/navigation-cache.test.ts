import assert from "node:assert/strict";
import { test } from "node:test";
import { BACKGROUND_STALE_MS, ROUTE_CACHE_MS, markOtherRoutesStale, shouldRefreshCachedRoute } from "./navigation-cache";

test("cold and expired destinations do not duplicate their navigation fetch", () => {
  assert.equal(shouldRefreshCachedRoute(undefined, ROUTE_CACHE_MS), false);
  assert.equal(shouldRefreshCachedRoute(0, ROUTE_CACHE_MS), false);
});
test("fresh cached visits do not request data again", () => {
  assert.equal(shouldRefreshCachedRoute(0, BACKGROUND_STALE_MS - 1), false);
});
test("stale cached visits refresh in the background within the cache window", () => {
  assert.equal(shouldRefreshCachedRoute(0, BACKGROUND_STALE_MS), true);
  assert.equal(shouldRefreshCachedRoute(0, ROUTE_CACHE_MS - 1), true);
});
test("save marks other visited pages stale without discarding their cache entries", () => {
  const visits = new Map([["/equipment", 50], ["/equipment/item", 50], ["/dashboard", 50]]);
  markOtherRoutesStale(visits, "/equipment", 100_000);
  assert.equal(visits.size, 3);
  assert.equal(shouldRefreshCachedRoute(visits.get("/equipment"), 100_000), false);
  assert.equal(shouldRefreshCachedRoute(visits.get("/equipment/item"), 100_000), true);
  assert.equal(shouldRefreshCachedRoute(visits.get("/dashboard"), 100_000), true);
});
