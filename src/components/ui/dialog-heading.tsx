"use client";

import { Cancel01Icon } from "@hugeicons/core-free-icons";
import { HugeiconsIcon } from "@hugeicons/react";

export function DialogHeading({ id, title, onClose, disabled = false }: { id?: string; title: string; onClose: () => void; disabled?: boolean }) {
  return <div className="flex items-start justify-between gap-4">
    <h2 id={id} className="min-w-0 text-lg font-semibold tracking-tight">{title}</h2>
    <button type="button" onClick={onClose} disabled={disabled} aria-label="Close dialog" className="grid size-9 shrink-0 place-items-center rounded-full border border-slate-200 text-slate-500 transition-colors hover:bg-slate-50 hover:text-slate-900 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-cyan-600 disabled:opacity-50"><HugeiconsIcon icon={Cancel01Icon} size={18} /></button>
  </div>;
}
