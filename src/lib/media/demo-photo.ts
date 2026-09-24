import { convertImageToWebp } from "./webp";

function dataUrl(file: File): Promise<string> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => typeof reader.result === "string" ? resolve(reader.result) : reject(new Error("Unable to read the photo."));
    reader.onerror = () => reject(new Error("Unable to read the photo."));
    reader.readAsDataURL(file);
  });
}

export async function demoPhotoFromFile(file: File, targetDimension = 900): Promise<string> {
  const webp = await convertImageToWebp(file, { targetDimension, maxOutputBytes: 120_000 });
  return dataUrl(webp);
}
