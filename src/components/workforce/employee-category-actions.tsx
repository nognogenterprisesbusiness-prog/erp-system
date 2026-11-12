"use client";

import { useActionState, useState } from "react";
import { archiveEmployeeCategoryAction, type WorkforceActionState } from "@/app/(workspace)/employees/actions";
import { RecordActionMenu } from "@/components/ui/record-action-menu";
import { RecordCreateDialog, RecordFormControls } from "@/components/ui/record-create-dialog";

const initialState: WorkforceActionState = { ok: false, message: "" };

function ArchiveCategoryForm({ id, name }: { id: string; name: string }) {
  const [state, action, pending] = useActionState(archiveEmployeeCategoryAction, initialState);
  return <form action={action} className="grid gap-4">
    <input type="hidden" name="id" value={id} />
    <p className="text-sm leading-6 text-slate-600">Archive <strong>{name}</strong>? It will no longer be available for new employees. Move employees out of this category first. Existing history is kept.</p>
    {state.message && !state.ok && <p role="alert" className="text-sm text-red-700">{state.message}</p>}
    <RecordFormControls busy={pending} success={state.ok} label="Confirm archive" />
  </form>;
}

export function EmployeeCategoryActions({ id, name }: { id: string; name: string }) {
  const [open, setOpen] = useState(false);
  return <>
    <RecordActionMenu name={name} actions={[{ label: "Edit", href: `/employees/categories?edit=${id}` }, { label: "Archive", destructive: true, onSelect: () => setOpen(true) }]} />
    {open && <RecordCreateDialog title="Archive employee category" hideTrigger size="sm" initialOpen onClosed={() => setOpen(false)}><ArchiveCategoryForm id={id} name={name} /></RecordCreateDialog>}
  </>;
}
