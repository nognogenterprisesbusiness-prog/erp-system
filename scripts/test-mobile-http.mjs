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
const compatibility = await fetch(new URL('/api/mobile/v1/compatibility', base));
assert.equal(compatibility.status, 200);
assert.match(compatibility.headers.get('cache-control') ?? '', /no-store/);
const metadata = await compatibility.json();
assert.equal(metadata.ok, true);
assert.equal(metadata.data.minimumProtocol, 1);
assert.equal(metadata.data.currentProtocol, 2);
assert.deepEqual(metadata.data.minimumBuilds, { android: null, ios: null });
for (const [protocol, expected] of [['invalid', 400], ['9999', 503]]) {
  const response = await fetch(new URL('/api/mobile/v1/commands', base), { method: 'POST', headers: { Authorization: 'Bearer test', 'X-Nognog-Mobile-Protocol': protocol, 'Content-Type': 'application/json' }, body: '{}' });
  assert.equal(response.status, expected);
  assert.equal((await response.json()).code, undefined, 'an invalid header or older server is not an app-update requirement');
}
const receipt = await fetch(new URL('/api/mobile/v1/site-purchases/receipt', base), { method: 'POST', body: new FormData() });
assert.equal(receipt.status, 401, 'receipt uploads remain bearer-authenticated');
console.log('PASS mobile HTTP: uncached compatibility metadata, malformed/newer protocols and receipt upload authentication.');
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
