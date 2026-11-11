import assert from "node:assert/strict";
import test from "node:test";
import { lockBodyScroll } from "./body-scroll-lock";

test("overlapping loading and ready panels restore scrolling only after both close", () => {
  const body = { style: { overflow: "auto" } };
  const closeLoading = lockBodyScroll(body);
  const closeReady = lockBodyScroll(body);
  closeLoading();
  assert.equal(body.style.overflow, "hidden");
  closeReady();
  assert.equal(body.style.overflow, "auto");
});

test("reverse cleanup and repeated cleanup preserve the original scroll style", () => {
  const body = { style: { overflow: "" } };
  const closeFirst = lockBodyScroll(body);
  const closeSecond = lockBodyScroll(body);
  closeSecond(); closeSecond();
  assert.equal(body.style.overflow, "hidden");
  closeFirst(); closeFirst();
  assert.equal(body.style.overflow, "");
});
