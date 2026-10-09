import assert from "node:assert/strict";
import test from "node:test";
import { formatNotificationTime } from "./time";

test("notification timestamps show Philippine date and time across the UTC date boundary", () => {
  const value = formatNotificationTime("2026-10-08T20:05:00Z");
  assert.match(value, /Oct 9, 2026/);
  assert.match(value, /4:05.*AM PHT/);
  assert.equal(value, formatNotificationTime("2026-10-09T04:05:00+08:00"));
});
test("malformed notification times do not crash a notification list", () => {
  assert.equal(formatNotificationTime("invalid"), "Time unavailable");
});
