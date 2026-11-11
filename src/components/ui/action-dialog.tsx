import type { ReactNode } from "react";
import { RecordCreateDialog } from "./record-create-dialog";

/** Keep commands visible; reuse the existing accessible, submission-aware form dialog. */
export function ActionDialog({ title, description, children, triggerLabel, retainDraft = false }: {
  title: string; description: string; children: ReactNode; triggerLabel?: string; retainDraft?: boolean;
}) {
  return <RecordCreateDialog title={title} triggerLabel={triggerLabel} triggerIcon={null} triggerVariant="outline" cancelLabel="Go back" retainDraft={retainDraft}>
    <p className="mb-5 text-sm leading-6 text-slate-600">{description}</p>
    {children}
  </RecordCreateDialog>;
}
