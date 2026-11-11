"use client";

import { createContext, useContext, useEffect, useId, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { PencilEdit02Icon, PlusSignIcon } from "@hugeicons/core-free-icons";
import { HugeiconsIcon } from "@hugeicons/react";
import { Button, type ButtonProps } from "./button";
import { DialogHeading } from "./dialog-heading";

const FormDialogContext = createContext<{ close: () => void; complete: () => void; setBusy: (busy: boolean) => void; cancelLabel: string } | null>(null);

export function useRecordDialog() { return useContext(FormDialogContext); }

export function RecordCreateDialog({ title, children, initialOpen = false, closeHref, triggerLabel, triggerVariant, triggerSize, triggerAriaLabel, triggerIcon, hideTrigger = false, onClosed, cancelLabel = "Cancel", retainDraft = false, confirmDiscard = false }: {
  title: string;
  children: React.ReactNode;
  initialOpen?: boolean;
  closeHref?: string;
  triggerLabel?: string;
  triggerVariant?: ButtonProps["variant"];
  triggerSize?: ButtonProps["size"];
  triggerAriaLabel?: string;
  triggerIcon?: React.ReactNode;
  hideTrigger?: boolean;
  onClosed?: () => void;
  cancelLabel?: string;
  /** Only for scoped transaction forms whose payload/key must survive an uncertain result. */
  retainDraft?: boolean;
  confirmDiscard?: boolean;
}) {
  const dialog = useRef<HTMLDialogElement>(null);
  const discardDialog = useRef<HTMLDialogElement>(null);
  const router = useRouter();
  const titleId = useId();
  const [formKey, setFormKey] = useState(0);
  const [opened, setOpened] = useState(initialOpen);
  const [draftMounted, setDraftMounted] = useState(initialOpen);
  const [busy, setBusy] = useState(false);
  const [dirty, setDirty] = useState(false);
  const completed = useRef(false);
  useEffect(() => { if (initialOpen && !dialog.current?.open) { setOpened(true); dialog.current?.showModal(); } }, [initialOpen]);
  const close = () => {
    if (busy) return;
    if (confirmDiscard && dirty && !retainDraft) { discardDialog.current?.showModal(); return; }
    dialog.current?.close();
  };
  const complete = () => {
    completed.current = true;
    dialog.current?.close();
    window.dispatchEvent(new Event("erp:records-saved"));
    if (initialOpen && closeHref) window.history.replaceState(null, "", closeHref);
  };
  return <>
    {!hideTrigger && <Button type="button" variant={triggerVariant} size={triggerSize} aria-label={triggerAriaLabel} title={triggerAriaLabel} onClick={() => { completed.current = false; setOpened(true); if (!retainDraft || !draftMounted) setFormKey((key) => key + 1); setDraftMounted(true); dialog.current?.showModal(); }}>{triggerIcon === undefined ? <HugeiconsIcon icon={title.startsWith("Edit") ? PencilEdit02Icon : PlusSignIcon} size={17} strokeWidth={1.5} /> : triggerIcon}{triggerLabel ?? title}</Button>}
    <dialog ref={dialog} aria-labelledby={titleId} onCancel={(event) => { if (event.target !== dialog.current) return; event.preventDefault(); close(); }} onClose={() => { setOpened(false); setDirty(false); if (!retainDraft || completed.current) setDraftMounted(false); onClosed?.(); if (!completed.current && initialOpen && closeHref) router.replace(closeHref, { scroll: false }); }} className="m-auto max-h-[90dvh] w-[min(100%-2rem,800px)] overflow-hidden rounded-2xl border border-slate-200 bg-white p-0 text-slate-900 shadow-xl backdrop:bg-slate-950/50">
      <div className="px-5 pt-5 sm:px-6 sm:pt-6"><DialogHeading id={titleId} title={title} onClose={close} disabled={busy} /></div>
      <FormDialogContext.Provider value={{ close, complete, setBusy, cancelLabel }}><div key={formKey} onInputCapture={() => { if (confirmDiscard && opened) setDirty(true); }} onChangeCapture={() => { if (confirmDiscard && opened) setDirty(true); }} className="dialog-scroll max-h-[calc(90dvh-5rem)] overflow-y-auto overscroll-contain px-5 pb-5 pt-5 sm:px-6 sm:pb-6">{(opened || (retainDraft && draftMounted)) && children}</div></FormDialogContext.Provider>
    </dialog>
    {confirmDiscard && <dialog ref={discardDialog} aria-labelledby={`${titleId}-discard`} aria-describedby={`${titleId}-discard-help`} className="m-auto w-[min(100%-2rem,460px)] rounded-2xl border border-slate-200 bg-white p-6 text-slate-900 shadow-xl backdrop:bg-slate-950/50">
      <h2 id={`${titleId}-discard`} className="text-lg font-semibold">Discard unsaved changes?</h2><p id={`${titleId}-discard-help`} className="mt-3 text-sm leading-6 text-slate-600">Your changes have not been saved. Keep editing to finish this form.</p>
      <div className="mt-6 flex flex-col-reverse gap-2 sm:flex-row sm:justify-end"><Button type="button" variant="outline" onClick={() => { discardDialog.current?.close(); dialog.current?.close(); }}>Discard changes</Button><Button type="button" onClick={() => discardDialog.current?.close()}>Keep editing</Button></div>
    </dialog>}
  </>;
}

export function RecordFormControls({ busy, disabled = false, label = "Save", success = false }: { busy: boolean; disabled?: boolean; label?: string; success?: boolean }) {
  const dialog = useContext(FormDialogContext);
  const setBusy = dialog?.setBusy;
  const complete = dialog?.complete;
  const handled = useRef(false);
  const controls = useRef<HTMLDivElement>(null);
  const wasBusy = useRef(false);
  useEffect(() => { setBusy?.(busy); }, [busy, setBusy]);
  useEffect(() => {
    if (busy) { handled.current = false; return; }
    if (success && !handled.current && complete) { handled.current = true; complete(); }
  }, [busy, success, complete]);
  useEffect(() => {
    if (wasBusy.current && !busy && !success) controls.current?.closest("form")?.querySelector<HTMLElement>('[aria-invalid="true"]')?.focus();
    wasBusy.current = busy;
  }, [busy, success]);
  return <div ref={controls} aria-busy={busy} className="mt-6 flex flex-col-reverse gap-2 sm:flex-row sm:justify-end">{dialog && <Button type="button" variant="outline" onClick={dialog.close} disabled={busy}>{dialog.cancelLabel}</Button>}<Button type="submit" disabled={busy || disabled} aria-busy={busy}>{busy ? <><span aria-hidden="true" className="size-4 animate-spin rounded-full border-2 border-current border-r-transparent motion-reduce:animate-none" />{label.endsWith("ing") ? label : `${label}…`}</> : label}</Button></div>;
}
