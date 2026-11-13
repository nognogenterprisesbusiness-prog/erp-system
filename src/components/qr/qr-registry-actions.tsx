"use client";

import { useRef, useState } from "react";
import Image from "next/image";
import { IntentLink as Link } from "@/components/layout/intent-link";

import { usePrintDocument } from "@/components/ui/print-document-button";
import { Button } from "@/components/ui/button";
import { RecordActionMenu } from "@/components/ui/record-action-menu";
import { DialogHeading } from "@/components/ui/dialog-heading";

export function QrRegistryActions({ id, identifier, label, status }: { id: string; identifier: string; label: string; status: string }) {
  const dialog = useRef<HTMLDialogElement>(null);
  const { print, busy, error } = usePrintDocument();
  const [opened, setOpened] = useState(false);
  const active = status === "active";
  return <>
    <RecordActionMenu name={`${label} QR label`} actions={[{ label: "View", onSelect: () => { setOpened(true); dialog.current?.showModal(); } }, ...(active ? [{ label: busy ? "Preparing print…" : "Print label", onSelect: () => void print(`/qr-codes/${id}/label`) }] : [])]} />
    <dialog onClose={() => setOpened(false)} ref={dialog} aria-labelledby={`qr-dialog-${id}`} className="m-auto w-[min(100%-2rem,420px)] rounded-2xl border border-slate-200 bg-white p-6 text-[#07152d] shadow-2xl backdrop:bg-slate-950/45">
      <DialogHeading id={`qr-dialog-${id}`} title={`${label} QR label`} onClose={() => dialog.current?.close()} />
      <p className="mt-2 break-all font-sans text-xs text-slate-500">{identifier}</p>
      {active ? <div className="mt-5 flex justify-center rounded-xl border border-slate-200 bg-white p-4"><Image src={`/qr-codes/${id}/image?format=svg`} width={220} height={220} alt={`QR code ${identifier}`} unoptimized /></div> : <p className="mt-5 rounded-lg bg-amber-50 p-4 text-sm text-amber-900">This label is {status} and cannot be printed.</p>}
      <div className="mt-5 flex flex-wrap justify-end gap-2"><Button variant="outline" onClick={() => dialog.current?.close()}>Close</Button><Button variant="outline" asChild><Link href={`/qr-codes/${id}`} onClick={() => dialog.current?.close()}>Details</Link></Button>{active && <Button disabled={busy} onClick={() => void print(`/qr-codes/${id}/label`)}>{busy ? "Preparing print…" : "Print label"}</Button>}</div>
      {error && <p role="alert" className="mt-3 text-sm text-red-700">{error}</p>}
    </dialog>
    {error && !opened && <p role="alert" className="mt-2 text-sm text-red-700">{error}</p>}
  </>;
}
