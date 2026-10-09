import assert from "node:assert/strict";
import test from "node:test";
import { mobileCompatibilitySchema, mobileUpdateRequiredSchema } from "@nognog/domain";
import { inspectMobileBuild, inspectMobileProtocol, mobileCompatibility } from "./compatibility";
import { assertMobileCompatibility, MobileError, mobileFailure } from "./http";
import { GET } from "@/app/api/mobile/v1/compatibility/route";

const future = { minimumProtocol: 2, currentProtocol: 3, updateUrls: { android: null, ios: null } };
test("compatible legacy clients keep working; additive or visual releases do not require updates", () => {
  assert.equal(inspectMobileProtocol(null), "compatible");
  assert.equal(inspectMobileProtocol("1"), "compatible");
  assert.equal(inspectMobileProtocol("2", { ...future, minimumProtocol: 1 }), "compatible");
  for (const header of ["", "0", "01", "1.0.0", "-1", "1junk", "10000"]) assert.equal(inspectMobileProtocol(header), "invalid");
});
test("only an explicitly incompatible client gets 426 before its body or mutation is processed", async () => {
  const request = new Request("http://localhost/api/mobile/v1/commands", { method: "POST", body: "unprocessed" });
  let error: unknown;
  try { assertMobileCompatibility(request, future); } catch (caught) { error = caught; }
  assert.ok(error instanceof MobileError && error.status === 426);
  assert.equal(request.bodyUsed, false);
  const response = mobileFailure(error);
  assert.equal(response.status, 426);
  assert.equal(mobileUpdateRequiredSchema.parse(await response.json()).compatibility.minimumProtocol, 2);
  assert.match(response.headers.get("cache-control") ?? "", /no-store/);
});
test("an older backend requires a system update, not another app update", () => {
  const request = new Request("http://localhost", { headers: { "X-Nognog-Mobile-Protocol": "4" } });
  assert.throws(() => assertMobileCompatibility(request, future), (error) => error instanceof MobileError && error.status === 503 && !error.compatibility);
});
test("a released build requirement blocks older Android and iOS builds before mutation", async () => {
  const policy = { minimumProtocol: 1, currentProtocol: 1, updateUrls: { android: "https://example.test/nognog.apk", ios: "https://example.test/nognog-ios" }, minimumBuilds: { android: 7, ios: 2 } };
  const request = (platform: string | null, build: string | null) => new Request("http://localhost/api/mobile/v1/commands", {
    method: "POST", body: "unprocessed", headers: {
      "X-Nognog-Mobile-Protocol": "1",
      ...(platform ? { "X-Nognog-Mobile-Platform": platform } : {}),
      ...(build ? { "X-Nognog-Mobile-Build": build } : {}),
    },
  });
  for (const [platform, build] of [["android", "6"], ["ios", "1"]] as const) {
    const older = request(platform, build);
    let error: unknown;
    try { assertMobileCompatibility(older, policy); } catch (caught) { error = caught; }
    assert.ok(error instanceof MobileError && error.status === 426);
    assert.equal(older.bodyUsed, false);
    const response = mobileFailure(error);
    assert.equal(mobileUpdateRequiredSchema.parse(await response.json()).compatibility.minimumBuilds?.android, 7);
  }
  for (const [platform, build] of [["android", "7"], ["android", "8"], ["ios", "2"], ["web", null], [null, null]] as const)
    assert.doesNotThrow(() => assertMobileCompatibility(request(platform, build), policy));
  assert.equal(inspectMobileBuild("android", "07", policy), "invalid");
  assert.equal(inspectMobileBuild("unknown", "7", policy), "invalid");
  assert.equal(inspectMobileBuild("android", "6", { ...policy, minimumBuilds: { android: null, ios: null } }), "compatible");
});
test("public metadata is uncached, validated and contains no account data or credentials", async () => {
  const response = GET();
  assert.equal(response.status, 200);
  assert.match(response.headers.get("cache-control") ?? "", /no-store/);
  const body = await response.json();
  assert.deepEqual(mobileCompatibilitySchema.parse(body.data), mobileCompatibility());
  assert.equal(mobileCompatibilitySchema.safeParse({ ...future, minimumProtocol: 4 }).success, false);
  for (const url of ["", "not a URL", "javascript:alert(1)", "http://example.test/app", "https://user:password@example.test/app"]) {
    assert.equal(mobileCompatibilitySchema.safeParse({ ...future, updateUrls: { android: url, ios: null } }).success, false);
  }
});
test("a malformed optional download setting does not take the mobile API offline", () => {
  const original = process.env.MOBILE_ANDROID_UPDATE_URL;
  try {
    for (const value of ["", "not a URL", "http://example.test/app"]) {
      process.env.MOBILE_ANDROID_UPDATE_URL = value;
      assert.equal(mobileCompatibility().updateUrls.android, null);
    }
  } finally {
    if (original === undefined) delete process.env.MOBILE_ANDROID_UPDATE_URL;
    else process.env.MOBILE_ANDROID_UPDATE_URL = original;
  }
});
test("minimum builds are inactive until configured for a release", () => {
  const oldAndroid = process.env.MOBILE_ANDROID_MIN_BUILD;
  const oldIos = process.env.MOBILE_IOS_MIN_BUILD;
  try {
    delete process.env.MOBILE_ANDROID_MIN_BUILD;
    delete process.env.MOBILE_IOS_MIN_BUILD;
    assert.deepEqual(mobileCompatibility().minimumBuilds, { android: null, ios: null });
    process.env.MOBILE_ANDROID_MIN_BUILD = "7";
    process.env.MOBILE_IOS_MIN_BUILD = "2";
    assert.deepEqual(mobileCompatibility().minimumBuilds, { android: 7, ios: 2 });
  } finally {
    if (oldAndroid === undefined) delete process.env.MOBILE_ANDROID_MIN_BUILD;
    else process.env.MOBILE_ANDROID_MIN_BUILD = oldAndroid;
    if (oldIos === undefined) delete process.env.MOBILE_IOS_MIN_BUILD;
    else process.env.MOBILE_IOS_MIN_BUILD = oldIos;
  }
});
test("a released protocol-2 build can require older protocol-1 apps to use their existing update prompt", () => {
  const previous = process.env.MOBILE_MIN_PROTOCOL;
  try {
    delete process.env.MOBILE_MIN_PROTOCOL;
    assert.equal(mobileCompatibility().minimumProtocol, 1);
    assert.equal(mobileCompatibility().currentProtocol, 2);
    process.env.MOBILE_MIN_PROTOCOL = "2";
    assert.equal(mobileCompatibility().minimumProtocol, 2);
    assert.equal(inspectMobileProtocol("1", mobileCompatibility()), "update_required");
    assert.equal(inspectMobileProtocol("2", mobileCompatibility()), "compatible");
  } finally {
    if (previous === undefined) delete process.env.MOBILE_MIN_PROTOCOL;
    else process.env.MOBILE_MIN_PROTOCOL = previous;
  }
});
