"use client";

import { useEffect, useState } from "react";
import Image from "next/image";
import { convertImageToWebp } from "@/lib/media/webp";

export function RecordPhotoInput({ label, currentPhoto, convertBeforeSubmit = false, onProcessingChange }: {
  label: string;
  currentPhoto?: string;
  convertBeforeSubmit?: boolean;
  onProcessingChange?: (processing: boolean) => void;
}) {
  const [preview, setPreview] = useState<string>();
  const [error, setError] = useState("");
  const [currentPhotoFailed, setCurrentPhotoFailed] = useState(false);
  useEffect(() => () => { if (preview) URL.revokeObjectURL(preview); }, [preview]);

  async function choose(input: HTMLInputElement) {
    const file = input.files?.[0];
    setError("");
    if (!file) { setPreview(undefined); return; }
    if (!convertBeforeSubmit) { setPreview(URL.createObjectURL(file)); return; }
    onProcessingChange?.(true);
    try {
      const converted = await convertImageToWebp(file, { targetDimension: 1600, maxOutputBytes: 700_000 });
      const files = new DataTransfer();
      files.items.add(converted);
      input.files = files.files;
      setPreview(URL.createObjectURL(converted));
    } catch (cause) {
      input.value = "";
      setPreview(undefined);
      setError(cause instanceof Error ? cause.message : "Unable to process this photo.");
    } finally { onProcessingChange?.(false); }
  }

  return <div className="text-sm font-medium text-slate-700">
    <label className="block cursor-pointer">
      <span>{label}</span>
      <span className="mt-2 flex items-center gap-4 rounded-xl border border-dashed border-slate-300 p-3 hover:border-cyan-500">
        <span className="relative grid size-20 shrink-0 place-items-center overflow-hidden rounded-lg bg-slate-100 text-xs text-slate-500">
          {preview || (currentPhoto && !currentPhotoFailed) ? <Image src={preview ?? currentPhoto ?? ""} alt="Selected record photo" fill sizes="80px" unoptimized className="object-cover" onError={() => { if (!preview) setCurrentPhotoFailed(true); }} /> : "No photo"}
        </span>
        <span className="min-w-0 flex-1"><span className="block text-sm font-medium text-slate-700">Choose PNG or JPEG</span><span className="mt-1 block text-xs font-normal text-slate-500">Converted to WebP before saving</span></span>
        <input name="photo" type="file" accept="image/png,image/jpeg,.png,.jpg,.jpeg" className="sr-only" onChange={(event) => void choose(event.currentTarget)} />
      </span>
    </label>
    {error ? <p role="alert" className="mt-2 text-sm font-medium text-red-700">{error}</p> : null}
  </div>;
}
