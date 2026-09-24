import assert from "node:assert/strict";
import { test } from "node:test";

import { detectSourceImage, webpFilename } from "./webp";

test("image signature detection accepts PNG/JPEG and rejects SVG masquerading as image", () => {
  assert.equal(detectSourceImage(new Uint8Array([137, 80, 78, 71, 13, 10, 26, 10, 0, 0, 0, 0])), "image/png");
  assert.equal(detectSourceImage(new Uint8Array([255, 216, 255, 224, 0, 0, 0, 0])), "image/jpeg");
  assert.equal(detectSourceImage(new TextEncoder().encode("<svg onload=alert(1)>")), null);
});

test("WebP output filename cannot contain paths or HTML", () => {
  assert.equal(webpFilename("../../<img onerror=alert(1)>.png"), "img-onerror-alert-1.webp");
  assert.equal(webpFilename("photo.jpg"), "photo.webp");
});
