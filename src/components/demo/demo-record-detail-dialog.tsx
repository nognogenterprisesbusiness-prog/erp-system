"use client";

import { useEffect, useRef } from "react";
import Image from "next/image";

import { Button } from "@/components/ui/button";
import { DialogHeading } from "@/components/ui/dialog-heading";

export type RecordDetail = { label: string; value: string | number };

export function DemoRecordDetailDialog({ name, photo, details, onClose }: {
  name: string;
  photo?: string;
  details: RecordDetail[];
  onClose: () => void;
}) {
  const dialog = useRef<HTMLDialogElement>(null);
  useEffect(() => { dialog.current?.showModal(); }, []);

  return <dialog ref={dialog} onClose={onClose} aria-label={`${name} details`} className="m-auto w-[min(100%-2rem,520px)] max-h-[90svh] overflow-y-auto rounded-2xl border border-slate-200 bg-white p-6 text-[#07152d] shadow-2xl backdrop:bg-slate-950/45">
    <DialogHeading title={name} onClose={() => dialog.current?.close()} />
    {photo && <div className="relative mt-5 h-48 overflow-hidden rounded-xl bg-slate-100"><Image src={photo} alt={`${name} photo`} fill sizes="520px" unoptimized={photo.startsWith("data:")} className="object-cover" /></div>}
    <dl className="mt-5 divide-y divide-slate-100">{details.map((detail) => <div key={detail.label} className="flex flex-wrap justify-between gap-x-5 gap-y-1 py-2.5 text-sm"><dt className="text-slate-500">{detail.label}</dt><dd className="max-w-full text-right font-medium text-slate-800">{detail.value}</dd></div>)}</dl>
    <div className="mt-6 flex justify-end"><Button type="button" variant="outline" onClick={() => dialog.current?.close()}>Close</Button></div>
  </dialog>;
}
