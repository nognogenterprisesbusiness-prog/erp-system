import assert from "node:assert/strict";
import { test } from "node:test";
import {
  bearerToken,
  boundedBody,
  mobileFailure,
  MobileError,
  databaseError,
} from "./http";
test("API requires an explicit bearer token instead of cookie authentication", () => {
  for (const header of [
    null,
    "",
    "Basic password",
    "Bearer ",
    "Bearer first second",
    "Bearer abc\nxyz",
  ])
    assert.throws(() => bearerToken(header), MobileError);
  assert.equal(bearerToken("Bearer abc.def.ghi"), "abc.def.ghi");
});
test("streamed bodies are bounded even without a Content-Length", async () => {
  const request = new Request("http://localhost/", {
    method: "POST",
    body: "123456789",
  });
  await assert.rejects(
    boundedBody(request, 8),
    (error) => error instanceof MobileError && error.status === 413,
  );
  const result = await boundedBody(
    new Request("http://localhost/", { method: "POST", body: "small" }),
    8,
  );
  assert.equal(new TextDecoder().decode(result), "small");
});
test("database/internal failures never disclose SQL or credentials", async () => {
  const response = mobileFailure(
    new Error("postgresql://sensitive schema failure"),
  );
  assert.equal(response.status, 500);
  assert.equal(
    JSON.stringify(await response.json()).includes("postgresql"),
    false,
  );
  assert.throws(
    () => databaseError({ code: "42501", message: "secret table" }),
    (error) =>
      error instanceof MobileError &&
      error.status === 403 &&
      !error.message.includes("secret"),
  );
  assert.throws(
    () => databaseError({ code: "23514", message: "private constraint detail" }),
    (error) =>
      error instanceof MobileError &&
      error.status === 503 &&
      error.message.includes("DB-23514") &&
      !error.message.includes("private constraint detail"),
  );
  assert.throws(
    () => databaseError({
      code: "23502",
      message: 'null value in column "category_id" of relation "suppliers" violates not-null constraint',
    }),
    (error) =>
      error instanceof MobileError &&
      error.status === 503 &&
      error.message.includes("latest purchasing update"),
  );
  assert.throws(
    () => databaseError({ code: "22023", message: "Invalid site purchase line" }),
    (error) =>
      error instanceof MobileError &&
      error.status === 422 &&
      error.message.includes("could not read one of the item lines"),
  );
});
