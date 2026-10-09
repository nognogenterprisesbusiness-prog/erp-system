import type { PDFFont } from "pdf-lib";

/** Keep supported accented names and fit text within the report's printable width. */
export function fitPdfText(value: string, font: PDFFont, size: number, width: number): string {
  const supported = new Set(font.getCharacterSet());
  const characters = Array.from(value.normalize("NFC"), (character) => {
    if (/\s/u.test(character)) return " ";
    return supported.has(character.codePointAt(0)!) ? character : "?";
  });
  const text = characters.join("");
  if (font.widthOfTextAtSize(text, size) <= width) return text;
  const suffix = "...";
  if (font.widthOfTextAtSize(suffix, size) > width) return "";
  while (characters.length && font.widthOfTextAtSize(characters.join("") + suffix, size) > width) characters.pop();
  return characters.join("").trimEnd() + suffix;
}
