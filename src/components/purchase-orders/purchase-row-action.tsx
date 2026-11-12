"use client";

import { useState, type ReactNode } from "react";
import { RecordActionMenu } from "@/components/ui/record-action-menu";
import { RecordCreateDialog } from "@/components/ui/record-create-dialog";

export function PurchaseRowAction({ name, viewHref, label, href, children }: { name: string; viewHref: string; label?: string; href?: string; children?: ReactNode }) {
  const [open, setOpen] = useState(false);
  return <>
    <RecordActionMenu name={name} actions={[{ label: "View", href: viewHref }, ...(label ? [href ? { label, href } : { label, onSelect: () => setOpen(true) }] : [])]} />
    {children && <RecordCreateDialog title="Supplier payment" hideTrigger initialOpen={open} retainDraft onClosed={() => setOpen(false)}>{children}</RecordCreateDialog>}
  </>;
}
