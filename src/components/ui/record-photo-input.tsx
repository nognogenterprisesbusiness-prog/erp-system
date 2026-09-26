"use client";

import { useEffect, useState } from "react";
import Image from "next/image";
import { convertImageToWebp, detectSourceImage, IMAGE_POLICY } from "@/lib/media/webp";

const directUploadLimit = 3_000_000;

export function RecordPhotoInput({ label, currentPhoto, convertBeforeSubmit = false, onProcessingChange, onPreparedFile, onPreparationError }: {
  label: string;
  currentPhoto?: string;
  convertBeforeSubmit?: boolean;
  onProcessingChange?: (processing: boolean) => void;
  onPreparedFile?: (file: File | null) => void;
  onPreparationError?: (message: string | null) => void;
}) {
  const [preview, setPreview] = useState<string>();
  const [photoSelected, setPhotoSelected] = useState(false);
  const [processing, setProcessing] = useState(false);
  const [error, setError] = useState("");
  const [currentPhotoFailed, setCurrentPhotoFailed] = useState(false);
  useEffect(() => () => { if (preview) URL.revokeObjectURL(preview); }, [preview]);

  async function choose(input: HTMLInputElement) {
    const file = input.files?.[0];
    setError("");
    onPreparationError?.(null);
    if (!file) { setPreview(undefined); setPhotoSelected(false); onPreparedFile?.(null); return; }
    if (!convertBeforeSubmit) { setPreview(URL.createObjectURL(file)); setPhotoSelected(true); onPreparedFile?.(file); return; }
    setProcessing(true);
    onProcessingChange?.(true);
    try {
      if (file.size === 0 || file.size > IMAGE_POLICY.maxSourceBytes) throw new Error("Choose a PNG or JPEG under 12 MB.");
      const signature = new Uint8Array(await file.slice(0, 12).arrayBuffer());
      if (!detectSourceImage(signature)) throw new Error("Choose a genuine PNG or JPEG image.");
      const prepared = file.size <= directUploadLimit
        ? file
        : await convertImageToWebp(file, { targetDimension: 1600, maxOutputBytes: 700_000 });
      if (prepared !== file && !onPreparedFile) {
        const files = new DataTransfer();
        files.items.add(prepared);
        input.files = files.files;
      }
      onPreparedFile?.(prepared);
      setPreview(URL.createObjectURL(prepared));
      setPhotoSelected(true);
    } catch (cause) {
      input.value = "";
      setPreview(undefined);
      setPhotoSelected(false);
      onPreparedFile?.(null);
      const message = cause instanceof Error ? cause.message : "Unable to process this photo.";
      setError(message);
      onPreparationError?.(message);
    } finally { setProcessing(false); onProcessingChange?.(false); }
  }

  return <div className="text-sm font-medium text-slate-700">
    <label className="block cursor-pointer">
      <span>{label}</span>
      <span className="mt-2 flex items-center gap-4 rounded-xl border border-dashed border-slate-300 p-3 hover:border-cyan-500">
        <span className="relative grid size-20 shrink-0 place-items-center overflow-hidden rounded-lg bg-slate-100 text-xs text-slate-500">
          {preview || (currentPhoto && !currentPhotoFailed) ? <Image src={preview ?? currentPhoto ?? ""} alt="Selected record photo" fill sizes="80px" unoptimized className="object-cover" onError={() => { if (!preview) setCurrentPhotoFailed(true); }} /> : processing ? "Processing…" : "No photo"}
        </span>
        <span className="min-w-0 flex-1"><span className="block text-sm font-medium text-slate-700">{processing ? "Processing photo…" : "Choose PNG or JPEG"}</span><span className="mt-1 block text-xs font-normal text-slate-500">Verified and converted to WebP when saved</span></span>
        <input name="photo" type="file" accept="image/png,image/jpeg,.png,.jpg,.jpeg" className="sr-only" onChange={(event) => void choose(event.currentTarget)} />
      </span>
    </label>
    <input type="hidden" name="photoSelected" value={photoSelected ? "1" : "0"} />
    {error ? <p role="alert" className="mt-2 text-sm font-medium text-red-700">{error}</p> : null}
  </div>;
}
