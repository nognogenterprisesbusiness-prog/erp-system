import assert from "node:assert/strict";
import { test } from "node:test";
import sharp from "sharp";

import { verifyRecordPhoto } from "./verify-record-photo";

test("a JPEG photo is converted to verified WebP", async () => {
  const jpeg = await sharp({ create: { width: 120, height: 80, channels: 3, background: "#3578b0" } }).jpeg().toBuffer();
  const result = await verifyRecordPhoto(jpeg);
  assert.equal((await sharp(result).metadata()).format, "webp");
});

test("non-image bytes cannot be attached as a photo", async () => {
  await assert.rejects(verifyRecordPhoto(Buffer.from("<svg onload=alert(1)>")), /could not be verified/);
});
