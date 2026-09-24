import assert from "node:assert/strict";
import { test } from "node:test";

import { NextRequest } from "next/server";

import { proxy } from "../../proxy";

test("demo route permits only same-origin location lookup and bypasses Supabase auth", async () => {
  const previousMode = process.env.APP_MODE;
  try {
    process.env.APP_MODE = "local-demo";
    const response = await proxy(new NextRequest("http://localhost:3000/demo?view=inventory"));
    assert.equal(response.status, 200);
    assert.match(response.headers.get("content-security-policy") ?? "", /connect-src 'self'/);
    assert.match(response.headers.get("content-security-policy") ?? "", /form-action 'self'/);
    assert.equal(response.headers.get("x-content-type-options"), "nosniff");
    assert.equal(response.headers.get("x-frame-options"), "DENY");
    const locations = await proxy(new NextRequest("http://localhost:3000/api/locations?demo=1"));
    assert.equal(locations.status, 200);
    const liveRoute = await proxy(new NextRequest("http://localhost:3000/projects"));
    assert.equal(liveRoute.status, 307);
    assert.equal(liveRoute.headers.get("location"), "http://localhost:3000/demo");
  } finally {
    if (previousMode === undefined) delete process.env.APP_MODE;
    else process.env.APP_MODE = previousMode;
  }
});
