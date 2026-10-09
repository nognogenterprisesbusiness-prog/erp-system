"use client";

import Image from "next/image";
import { useId, useRef } from "react";
import { Button } from "@/components/ui/button";
import type { ManualFigure } from "@/lib/help/manual";

function ScreenshotFrame({ figure, enlarged = false }: { figure: ManualFigure; enlarged?: boolean }) {
  return <div className="relative isolate overflow-hidden rounded-lg border border-slate-200 bg-white" style={{ maxWidth: figure.width }}>
    <Image src={figure.src} width={figure.width} height={figure.height} alt={figure.alt} sizes={enlarged ? "95vw" : "(max-width: 768px) 90vw, 800px"} className="h-auto w-full" />
    {figure.marks.map((mark, index) => <span key={mark.label} aria-hidden="true" className="pointer-events-none absolute rounded border-2 border-cyan-700 bg-cyan-500/5"
      style={{ left: `${mark.x}%`, top: `${mark.y}%`, width: `${mark.width}%`, height: `${mark.height}%` }}>
      <span className="absolute -bottom-0.5 -right-0.5 flex size-5 items-center justify-center rounded-full bg-cyan-800 text-xs font-bold text-white ring-2 ring-white sm:size-6 sm:text-sm">{index + 1}</span>
    </span>)}
  </div>;
}

export function AnnotatedScreenshot({ figure }: { figure: ManualFigure }) {
  const id = useId();
  const dialog = useRef<HTMLDialogElement>(null);
  const title = figure.title ?? "Form example";
  return <figure aria-labelledby={`${id}-caption`} className="my-8">
    <div className="mb-3 flex flex-wrap items-center justify-between gap-2"><h3 className="text-base font-semibold text-slate-900">{title}</h3>
      <Button type="button" variant="outline" onClick={() => dialog.current?.showModal()} aria-label={`Enlarge screenshot: ${title}`}>Enlarge ↗</Button>
    </div>
    <ScreenshotFrame figure={figure} />
    <figcaption id={`${id}-caption`} className="mt-4 text-sm leading-6 text-slate-600">
      <p>Empty form example. Text inside the inputs shows examples; enter your own details. Choices depend on your role and assignments.</p>
      <ol className="mt-3 list-decimal space-y-2 pl-5">{figure.marks.map((mark) => <li key={mark.label}>{mark.label}</li>)}</ol>
    </figcaption>
    <dialog ref={dialog} aria-labelledby={`${id}-zoom-title`} style={{ maxWidth: Math.max(640, figure.width + 64) }} className="fixed inset-0 m-auto max-h-[90dvh] w-[96vw] overflow-auto rounded-xl border border-slate-200 bg-white p-4 text-slate-900 shadow-xl backdrop:bg-slate-950/70 sm:p-6">
      <div className="mb-5 flex items-center justify-between gap-3"><h2 id={`${id}-zoom-title`} className="text-base font-semibold">{title}</h2><Button type="button" variant="outline" onClick={() => dialog.current?.close()} autoFocus>Close preview</Button></div>
      <div className="overflow-x-auto"><div className="mx-auto" style={{ width: figure.width, maxWidth: "none" }}><ScreenshotFrame figure={figure} enlarged /></div></div>
      <p className="mt-3 text-sm text-slate-500">On smaller screens, scroll sideways to inspect the full-size image. Press Escape or Close preview to return.</p>
      <ol className="mt-4 list-decimal space-y-2 pl-5 text-sm leading-6 text-slate-600">{figure.marks.map((mark) => <li key={mark.label}>{mark.label}</li>)}</ol>
    </dialog>
  </figure>;
}
