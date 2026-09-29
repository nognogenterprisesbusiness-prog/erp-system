"use client";

import { useRouter } from "next/navigation";
import { useEffect, useId, useRef } from "react";
import { DialogHeading } from "@/components/ui/dialog-heading";

export function InvoiceRouteModal({ children }: { children: React.ReactNode }) {
  const dialog = useRef<HTMLDialogElement>(null);
  const router = useRouter();
  const titleId = useId();

  useEffect(() => {
    dialog.current?.showModal();
  }, []);

  const close = () => router.back();

  return <dialog
    ref={dialog}
    aria-labelledby={titleId}
    onCancel={(event) => { event.preventDefault(); close(); }}
    onClick={(event) => { if (event.target === dialog.current) close(); }}
    className="m-auto max-h-[90dvh] w-[min(100%-2rem,800px)] overflow-hidden rounded-2xl border border-slate-200 bg-white p-0 text-slate-900 shadow-xl backdrop:bg-slate-950/50"
  >
    <div className="px-5 pt-5 sm:px-6 sm:pt-6"><DialogHeading id={titleId} title="New invoice" onClose={close} /></div>
    <div className="dialog-scroll max-h-[calc(90dvh-5rem)] overflow-y-auto overscroll-contain px-5 pb-5 pt-5 sm:px-6 sm:pb-6">{children}</div>
  </dialog>;
}
