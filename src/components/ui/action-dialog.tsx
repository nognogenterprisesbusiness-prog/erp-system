import type { ReactNode } from "react";
import type { ButtonProps } from "./button";
import { RecordCreateDialog } from "./record-create-dialog";

/** Keep commands visible; reuse the existing accessible, submission-aware form dialog. */
export function ActionDialog({ title, description, children, triggerLabel, retainDraft = false, triggerVariant = "outline" }: {
  title: string; description: string; children: ReactNode; triggerLabel?: string; retainDraft?: boolean; triggerVariant?: ButtonProps["variant"];
}) {
  return <RecordCreateDialog title={title} triggerLabel={triggerLabel} triggerIcon={null} triggerVariant={triggerVariant} cancelLabel="Go back" retainDraft={retainDraft}>
    <p className="mb-5 text-sm leading-6 text-slate-600">{description}</p>
    {children}
  </RecordCreateDialog>;
}
