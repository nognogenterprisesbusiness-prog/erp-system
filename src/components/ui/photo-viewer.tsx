"use client";

import Image from "next/image";
import { useId, useRef } from "react";
import { Cancel01Icon } from "@hugeicons/core-free-icons";
import { HugeiconsIcon } from "@hugeicons/react";

export function PhotoViewer({ src, alt, className = "h-full w-full", sizes = "100vw" }: { src: string; alt: string; className?: string; sizes?: string }) {
  const dialog = useRef<HTMLDialogElement>(null);
  const titleId = useId();
  return <>
    <button type="button" onClick={() => dialog.current?.showModal()} aria-label={`View ${alt} fullscreen`} className={`relative block overflow-hidden focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-cyan-600 ${className}`}>
      <Image src={src} alt={alt} fill sizes={sizes} unoptimized className="object-cover" />
    </button>
    <dialog ref={dialog} aria-labelledby={titleId} onClick={(event) => { if (event.target === event.currentTarget) dialog.current?.close(); }} className="fixed inset-0 m-0 h-dvh max-h-none w-screen max-w-none border-0 bg-black/95 p-5 text-white backdrop:bg-black/80">
      <div className="flex items-center justify-between gap-4"><h2 id={titleId} className="text-sm font-medium">{alt}</h2><button type="button" onClick={() => dialog.current?.close()} aria-label="Close photo" className="grid size-10 place-items-center rounded-full hover:bg-white/15 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-white"><HugeiconsIcon icon={Cancel01Icon} size={22} strokeWidth={1.5} /></button></div>
      <div className="relative mt-4 h-[calc(100dvh-6rem)]"><Image src={src} alt={alt} fill sizes="100vw" unoptimized className="object-contain" /></div>
    </dialog>
  </>;
}
