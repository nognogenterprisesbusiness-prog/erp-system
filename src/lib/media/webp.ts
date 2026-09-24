export const IMAGE_POLICY = {
  maxSourceBytes: 12_000_000,
  maxOutputBytes: 2_000_000,
  maxPixels: 32_000_000,
  maxDimension: 8_192,
  targetDimension: 2_400,
} as const;

export type SourceImageType = "image/png" | "image/jpeg";

export function detectSourceImage(bytes: Uint8Array): SourceImageType | null {
  const png = [137, 80, 78, 71, 13, 10, 26, 10];
  if (png.every((value, index) => bytes[index] === value)) return "image/png";
  if (bytes[0] === 255 && bytes[1] === 216 && bytes[2] === 255) return "image/jpeg";
  return null;
}

export function webpFilename(original: string): string {
  const stem = original.replace(/\.[^.]+$/, "").normalize("NFKC")
    .replace(/[^a-zA-Z0-9_-]+/g, "-").replace(/^-+|-+$/g, "").slice(0, 80);
  return `${stem || "image"}.webp`;
}

function canvasBlob(canvas: HTMLCanvasElement, quality: number): Promise<Blob> {
  return new Promise((resolve, reject) => {
    canvas.toBlob((blob) => {
      if (!blob || blob.type !== "image/webp") reject(new Error("This browser cannot encode WebP images."));
      else resolve(blob);
    }, "image/webp", quality);
  });
}

export async function convertImageToWebp(file: File, options: { targetDimension?: number; maxOutputBytes?: number } = {}): Promise<File> {
  if (file.size === 0 || file.size > IMAGE_POLICY.maxSourceBytes) {
    throw new Error("Choose a PNG or JPEG under 12 MB.");
  }
  const signature = new Uint8Array(await file.slice(0, 12).arrayBuffer());
  const detected = detectSourceImage(signature);
  if (!detected || file.type !== detected) throw new Error("Only genuine PNG and JPEG images are supported.");
  if (typeof createImageBitmap !== "function") throw new Error("This browser cannot process images locally.");

  const bitmap = await createImageBitmap(file);
  try {
    if (bitmap.width <= 0 || bitmap.height <= 0 || bitmap.width > IMAGE_POLICY.maxDimension || bitmap.height > IMAGE_POLICY.maxDimension || bitmap.width * bitmap.height > IMAGE_POLICY.maxPixels) {
      throw new Error("Image dimensions are too large to process safely.");
    }
    const targetDimension = Math.min(IMAGE_POLICY.targetDimension, Math.max(1, options.targetDimension ?? IMAGE_POLICY.targetDimension));
    const maxOutputBytes = Math.min(IMAGE_POLICY.maxOutputBytes, Math.max(1, options.maxOutputBytes ?? IMAGE_POLICY.maxOutputBytes));
    const scale = Math.min(1, targetDimension / Math.max(bitmap.width, bitmap.height));
    let width = Math.max(1, Math.round(bitmap.width * scale));
    let height = Math.max(1, Math.round(bitmap.height * scale));
    const canvas = document.createElement("canvas");
    const context = canvas.getContext("2d", { alpha: true });
    if (!context) throw new Error("Image processing is unavailable in this browser.");

    for (let attempt = 0; attempt < 4; attempt += 1) {
      canvas.width = width;
      canvas.height = height;
      context.drawImage(bitmap, 0, 0, width, height);
      const blob = await canvasBlob(canvas, 0.82 - attempt * 0.12);
      if (blob.size <= maxOutputBytes) {
        return new File([blob], webpFilename(file.name), { type: "image/webp", lastModified: Date.now() });
      }
      width = Math.max(1, Math.round(width * 0.75));
      height = Math.max(1, Math.round(height * 0.75));
    }
    throw new Error("The converted image is still too large. Choose a smaller source image.");
  } finally {
    bitmap.close();
  }
}
