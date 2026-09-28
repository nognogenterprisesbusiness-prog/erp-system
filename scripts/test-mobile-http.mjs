import assert from "node:assert/strict";
const base = new URL(
  process.env.MOBILE_TEST_ERP_URL ?? "http://localhost:3103",
);
if (!["localhost", "127.0.0.1", "[::1]"].includes(base.hostname))
  throw new Error("HTTP smoke checks require a local ERP server.");
for (const options of [
  {},
  { headers: { Authorization: "Bearer contains whitespace" } },
  { headers: { Cookie: "sb-access-token=not-a-session" } },
  {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      action: "read-all-notifications",
      input: { read: true },
    }),
  },
]) {
  const path = options.method === "POST" ? "commands" : "session";
  const response = await fetch(new URL(`/api/mobile/v1/${path}`, base), {
    ...options,
    signal: AbortSignal.timeout(10_000),
  });
  assert.equal(response.status, 401);
  assert.match(response.headers.get("cache-control") ?? "", /no-store/);
  const body = await response.json();
  assert.equal(body.ok, false);
  assert.equal("data" in body, false);
}
console.log(
  "PASS mobile HTTP: missing/malformed bearer tokens and cookie-only authentication are rejected; unauthenticated commands return no data.",
);
const profileResponse = await fetch(new URL("/api/mobile/v1/profile", base), {
  method: "POST",
  headers: { "Content-Type": "application/json" },
  body: JSON.stringify({ fullName: "Unauthorized Name" }),
  signal: AbortSignal.timeout(10_000),
});
assert.equal(profileResponse.status, 401);
assert.match(profileResponse.headers.get("cache-control") ?? "", /no-store/);
assert.equal((await profileResponse.json()).ok, false);
console.log("PASS mobile HTTP: profile updates require bearer authentication.");
for (const method of ["GET", "POST"]) {
  const response = await fetch(new URL("/api/mobile/v1/profile/photo", base), {
    method,
    signal: AbortSignal.timeout(10_000),
  });
  assert.equal(response.status, 401);
  assert.match(response.headers.get("cache-control") ?? "", /no-store/);
  assert.equal((await response.json()).ok, false);
}
console.log("PASS mobile HTTP: profile photo reads and uploads require bearer authentication.");
