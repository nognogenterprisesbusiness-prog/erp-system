"use client";

import { createContext, startTransition, useContext, useEffect, useId, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { PencilEdit02Icon, PlusSignIcon } from "@hugeicons/core-free-icons";
import { HugeiconsIcon } from "@hugeicons/react";
import { Button, type ButtonProps } from "./button";
import { DialogHeading } from "./dialog-heading";

const FormDialogContext = createContext<{ close: () => void; complete: () => void; setBusy: (busy: boolean) => void } | null>(null);

export function useRecordDialog() { return useContext(FormDialogContext); }

export function RecordCreateDialog({ title, children, initialOpen = false, closeHref, triggerLabel, triggerVariant, triggerIcon, hideTrigger = false, onClosed }: {
  title: string;
  children: React.ReactNode;
  initialOpen?: boolean;
  closeHref?: string;
  triggerLabel?: string;
  triggerVariant?: ButtonProps["variant"];
  triggerIcon?: React.ReactNode;
  hideTrigger?: boolean;
  onClosed?: () => void;
}) {
  const dialog = useRef<HTMLDialogElement>(null);
  const router = useRouter();
  const titleId = useId();
  const [formKey, setFormKey] = useState(0);
  const [busy, setBusy] = useState(false);
  const completed = useRef(false);
  useEffect(() => { if (initialOpen && !dialog.current?.open) dialog.current?.showModal(); }, [initialOpen]);
  const close = () => { if (!busy) dialog.current?.close(); };
  const complete = () => {
    completed.current = true;
    dialog.current?.close();
    window.dispatchEvent(new Event("erp:records-saved"));
    if (initialOpen && closeHref) window.history.replaceState(null, "", closeHref);
    startTransition(() => router.refresh());
  };
  return <>
    {!hideTrigger && <Button type="button" variant={triggerVariant} onClick={() => { completed.current = false; setFormKey((key) => key + 1); dialog.current?.showModal(); }}>{triggerIcon === undefined ? <HugeiconsIcon icon={title.startsWith("Edit") ? PencilEdit02Icon : PlusSignIcon} size={17} strokeWidth={1.5} /> : triggerIcon}{triggerLabel ?? title}</Button>}
    <dialog ref={dialog} aria-labelledby={titleId} onCancel={(event) => { if (busy) event.preventDefault(); }} onClose={() => { onClosed?.(); if (!completed.current && initialOpen && closeHref) router.replace(closeHref, { scroll: false }); }} className="m-auto max-h-[90dvh] w-[min(100%-2rem,800px)] overflow-hidden rounded-2xl border border-slate-200 bg-white p-0 text-slate-900 shadow-xl backdrop:bg-slate-950/50">
      <div className="px-5 pt-5 sm:px-6 sm:pt-6"><DialogHeading id={titleId} title={title} onClose={close} disabled={busy} /></div>
      <FormDialogContext.Provider value={{ close, complete, setBusy }}><div key={formKey} className="dialog-scroll max-h-[calc(90dvh-5rem)] overflow-y-auto overscroll-contain px-5 pb-5 pt-5 sm:px-6 sm:pb-6">{children}</div></FormDialogContext.Provider>
    </dialog>
  </>;
}

export function RecordFormControls({ busy, disabled = false, label = "Save" }: { busy: boolean; disabled?: boolean; label?: string }) {
  const dialog = useContext(FormDialogContext);
  const setBusy = dialog?.setBusy;
  useEffect(() => { setBusy?.(busy); }, [busy, setBusy]);
  return <div className="mt-6 flex justify-end gap-2">{dialog && <Button type="button" variant="outline" onClick={dialog.close} disabled={busy}>Cancel</Button>}<Button type="submit" disabled={busy || disabled} aria-busy={busy}>{busy ? <><span aria-hidden="true" className="size-4 animate-spin rounded-full border-2 border-current border-r-transparent motion-reduce:animate-none" />{label.endsWith("ing") ? label : `${label}…`}</> : label}</Button></div>;
}
