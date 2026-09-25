"use client";

import { useEffect, useRef } from "react";
import Image from "next/image";
import { Store02Icon } from "@hugeicons/core-free-icons";
import { HugeiconsIcon } from "@hugeicons/react";

import { Button } from "@/components/ui/button";
import { DialogHeading } from "@/components/ui/dialog-heading";

export type RecordDetail = { label: string; value: string | number };

export function DemoRecordDetailDialog({ name, photo, details, history, children, onClose, showPhotoPlaceholder = false }: {
  name: string;
  photo?: string;
  showPhotoPlaceholder?: boolean;
  details: RecordDetail[];
  history?: { id: string; label: string; detail: string; date: string }[];
  children?: React.ReactNode;
  onClose: () => void;
}) {
  const dialog = useRef<HTMLDialogElement>(null);
  useEffect(() => { dialog.current?.showModal(); }, []);

  return <dialog ref={dialog} onClose={onClose} aria-label={`${name} details`} className="m-auto max-h-[90svh] w-[min(100%-2rem,520px)] overflow-y-auto rounded-2xl border border-slate-200 bg-white p-6 text-[#07152d] shadow-2xl backdrop:bg-slate-950/45">
    <DialogHeading title={name} onClose={() => dialog.current?.close()} />
    {(photo || showPhotoPlaceholder) && <div className="relative mt-5 grid h-48 place-items-center overflow-hidden rounded-xl bg-slate-100 text-slate-400">{photo ? <Image src={photo} alt={`${name} photo`} fill sizes="520px" unoptimized={photo.startsWith("data:")} className="object-cover" /> : <div className="flex flex-col items-center gap-2"><HugeiconsIcon icon={Store02Icon} size={32} aria-hidden="true" /><span className="text-xs">No photo</span></div>}</div>}
    <dl className="mt-5 divide-y divide-slate-100">{details.map((detail) => <div key={detail.label} className="flex flex-wrap justify-between gap-x-5 gap-y-1 py-2.5 text-sm"><dt className="text-slate-500">{detail.label}</dt><dd className="max-w-full text-right font-medium text-slate-800">{detail.value}</dd></div>)}</dl>
    {history && <section className="mt-5 border-t border-slate-100 pt-4"><h3 className="text-sm font-semibold">History</h3>{history.length ? <ol className="mt-2 divide-y divide-slate-100">{history.map((event) => <li key={event.id} className="py-2.5"><div className="flex items-start justify-between gap-3"><p className="text-sm font-medium">{event.label}</p><time className="shrink-0 text-xs text-slate-500">{new Date(event.date).toLocaleDateString("en-PH")}</time></div><p className="mt-1 text-xs text-slate-500">{event.detail}</p></li>)}</ol> : <p className="mt-2 text-xs text-slate-500">No history recorded yet.</p>}</section>}
    {children}
    <div className="mt-6 flex justify-end"><Button type="button" variant="outline" onClick={() => dialog.current?.close()}>Close</Button></div>
  </dialog>;
}
