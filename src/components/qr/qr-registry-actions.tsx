"use client";

import { useRef } from "react";
import Image from "next/image";
import { IntentLink as Link } from "@/components/layout/intent-link";
import { PrinterIcon, ViewIcon } from "@hugeicons/core-free-icons";
import { HugeiconsIcon } from "@hugeicons/react";

import { Button } from "@/components/ui/button";
import { DialogHeading } from "@/components/ui/dialog-heading";

const actionClass = "grid size-9 place-items-center rounded-full text-slate-600 hover:bg-slate-100 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-cyan-600 disabled:cursor-not-allowed disabled:opacity-40";

export function QrRegistryActions({ id, identifier, label, status }: { id: string; identifier: string; label: string; status: string }) {
  const dialog = useRef<HTMLDialogElement>(null);
  const active = status === "active";
  return <>
    <div className="flex justify-end gap-1">
      <button type="button" aria-label={`View ${label} QR label`} title="View QR label" className={actionClass} onClick={() => dialog.current?.showModal()}><HugeiconsIcon icon={ViewIcon} size={18} /></button>
      {active ? <Link href={`/qr-codes/${id}/label`} target="_blank" aria-label={`Print ${label} QR label`} title="Print QR label" className={actionClass}><HugeiconsIcon icon={PrinterIcon} size={18} /></Link> : <button type="button" disabled aria-label="Inactive QR label cannot be printed" title="Inactive QR label cannot be printed" className={actionClass}><HugeiconsIcon icon={PrinterIcon} size={18} /></button>}
    </div>
    <dialog ref={dialog} aria-labelledby={`qr-dialog-${id}`} className="m-auto w-[min(100%-2rem,420px)] rounded-2xl border border-slate-200 bg-white p-6 text-[#07152d] shadow-2xl backdrop:bg-slate-950/45">
      <DialogHeading id={`qr-dialog-${id}`} title={`${label} QR label`} onClose={() => dialog.current?.close()} />
      <p className="mt-2 break-all font-mono text-xs text-slate-500">{identifier}</p>
      {active ? <div className="mt-5 flex justify-center rounded-xl border border-slate-200 bg-white p-4"><Image src={`/qr-codes/${id}/image?format=svg`} width={220} height={220} alt={`QR code ${identifier}`} unoptimized /></div> : <p className="mt-5 rounded-lg bg-amber-50 p-4 text-sm text-amber-900">This label is {status} and cannot be printed.</p>}
      <div className="mt-5 flex flex-wrap justify-end gap-2"><Button variant="outline" onClick={() => dialog.current?.close()}>Close</Button><Button variant="outline" asChild><Link href={`/qr-codes/${id}`}>Details</Link></Button>{active && <Button asChild><Link href={`/qr-codes/${id}/label`} target="_blank"><HugeiconsIcon icon={PrinterIcon} size={17} />Print label</Link></Button>}</div>
    </dialog>
  </>;
}
