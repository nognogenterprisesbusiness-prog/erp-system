import assert from "node:assert/strict";
import test from "node:test";
import { PDFDocument, StandardFonts } from "pdf-lib";
import { fitPdfText } from "./pdf-text";

test("financial PDF preserves accented project names and respects the page width", async () => {
  const document = await PDFDocument.create();
  const font = await document.embedFont(StandardFonts.Helvetica);
  const name = "P-01 - Peña / Muñoz – Cafe\u0301";
  assert.equal(fitPdfText(name, font, 10, 499), name.normalize("NFC"));
  const longName = "Very wide project W".repeat(20);
  const fitted = fitPdfText(longName, font, 10, 499);
  assert(fitted.endsWith("..."));
  assert(font.widthOfTextAtSize(fitted, 10) <= 499);
  const cleaned = fitPdfText("Site\nA\u0000漢", font, 10, 499);
  assert.equal(cleaned, "Site A??");
  document.addPage().drawText(cleaned, { font, size: 10 });
  assert((await document.save()).length > 0);
});
