"use client";

import { useLayoutEffect, useId, useRef, useState, type ReactNode } from "react";
import { useRouter } from "next/navigation";
import { Button } from "./button";
import { lockBodyScroll } from "@/lib/ui/body-scroll-lock";

/** The canonical server page supplies the content and all of its access checks. */
export function RecordDetailPanel({ title, children }: { title: string; children: ReactNode }) {
  const ref = useRef<HTMLDialogElement>(null);
  const titleId = useId();
  const router = useRouter();
  const [busy, setBusy] = useState(false);
  useLayoutEffect(() => {
    const dialog = ref.current;
    if (!dialog) return;
    const unlockScroll = lockBodyScroll(document.body);
    if (!dialog.open) dialog.showModal();
    const update = () => setBusy(!!dialog.querySelector('[aria-busy="true"]'));
    const observer = new MutationObserver(update);
    observer.observe(dialog, { subtree: true, childList: true, attributes: true, attributeFilter: ["aria-busy"] });
    update();
    return () => { observer.disconnect(); dialog.close(); unlockScroll(); };
  }, []);
  function close() {
    if (!ref.current?.querySelector('[aria-busy="true"]')) router.back();
  }
  return <dialog ref={ref} aria-labelledby={titleId} data-record-detail-panel
    onCancel={event => { if (event.target === ref.current) { event.preventDefault(); close(); } }}
    className="record-detail-panel fixed inset-y-0 left-auto right-0 m-0 h-dvh max-h-dvh w-full max-w-[1200px] overflow-hidden border-0 border-l border-slate-200 bg-slate-50 p-0 text-slate-900 shadow-2xl backdrop:bg-slate-950/45">
    <div className="flex min-h-16 items-center justify-between gap-4 border-b border-slate-200 bg-white px-4 py-3 sm:px-6">
      <h2 id={titleId} className="text-base font-semibold">{title}</h2>
      <Button type="button" variant="outline" size="sm" onClick={close} disabled={busy} aria-label={`Close ${title.toLowerCase()}`}>Close</Button>
    </div>
    <div className="record-detail-content dialog-scroll h-[calc(100dvh-4.5rem)] overflow-y-auto overscroll-contain p-4 sm:p-6">{children}</div>
  </dialog>;
}
