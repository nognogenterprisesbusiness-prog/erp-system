import sharp from "sharp";

export async function verifyRecordPhoto(source: Buffer): Promise<Buffer> {
  try {
    const image = sharp(source, { limitInputPixels: 32_000_000, failOn: "error" });
    const metadata = await image.metadata();
    if (!metadata.format || !["jpeg", "png", "webp"].includes(metadata.format) || !metadata.width || !metadata.height || metadata.width > 8192 || metadata.height > 8192 || (metadata.pages ?? 1) !== 1) throw new Error();
    const encoded = await image.rotate().resize(1600, 1600, { fit: "inside", withoutEnlargement: true }).webp({ quality: 80 }).toBuffer();
    if (encoded.length > 2_000_000) throw new Error();
    return encoded;
  } catch {
    throw new Error("The photo could not be verified. Choose another PNG or JPEG image.");
  }
}
