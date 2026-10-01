"use client";

import { useState, type FormEvent } from "react";
import { deleteProjectDocumentAction, updateProjectDocumentAction } from "@/app/(workspace)/projects/document-actions";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { RecordActionMenu } from "@/components/ui/record-action-menu";
import { RecordCreateDialog, RecordFormControls, useRecordDialog } from "@/components/ui/record-create-dialog";
import { SelectPicker } from "@/components/ui/select-picker";
import { projectDocumentCategories } from "@/lib/project-documents";
import type { ProjectDocumentCategory } from "@/types/database";

type EditableDocument = { id: string; file_name: string; category: ProjectDocumentCategory };

function EditDocumentForm({ document }: { document: EditableDocument }) {
  const dialog = useRecordDialog();
  const [name, setName] = useState(document.file_name);
  const [category, setCategory] = useState<ProjectDocumentCategory>(document.category);
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState("");
  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!name.trim()) { setMessage("Enter a document name."); return; }
    setBusy(true);
    const form = new FormData();
    form.set("id", document.id); form.set("name", name.trim()); form.set("category", category);
    const result = await updateProjectDocumentAction(form).catch(() => ({ ok: false, message: "The document could not be updated. Please try again." }));
    setBusy(false);
    if (!result.ok) { setMessage(result.message); return; }
    dialog?.complete();
  }
  return <form onSubmit={submit} className="space-y-4">
    <div><label htmlFor={`document-name-${document.id}`} className="mb-2 block text-sm font-medium text-slate-700">Document name</label><Input id={`document-name-${document.id}`} value={name} onChange={(event) => setName(event.currentTarget.value)} maxLength={180} required disabled={busy} /></div>
    <div><label htmlFor={`document-category-${document.id}`} className="mb-2 block text-sm font-medium text-slate-700">Document type</label><SelectPicker id={`document-category-${document.id}`} label="Document type" value={category} onValueChange={(value) => setCategory(value as ProjectDocumentCategory)} options={projectDocumentCategories} disabled={busy} /></div>
    {message && <p role="alert" className="text-sm text-red-700">{message}</p>}
    <RecordFormControls busy={busy} label="Save changes" />
  </form>;
}

function DeleteDocumentForm({ document }: { document: EditableDocument }) {
  const dialog = useRecordDialog();
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState("");
  async function remove() {
    setBusy(true);
    dialog?.setBusy(true);
    const form = new FormData();
    form.set("id", document.id);
    const result = await deleteProjectDocumentAction(form).catch(() => ({ ok: false, message: "The document could not be deleted. Please try again." }));
    setBusy(false);
    dialog?.setBusy(false);
    if (!result.ok) { setMessage(result.message); return; }
    dialog?.complete();
  }
  return <div className="space-y-4">
    <p className="text-sm text-slate-600">Delete <span className="font-semibold text-slate-900">{document.file_name}</span>? The file is removed for everyone on this project. The deletion is recorded in the audit log.</p>
    {message && <p role="alert" className="text-sm text-red-700">{message}</p>}
    <div className="flex justify-end gap-2"><Button type="button" variant="outline" onClick={dialog?.close} disabled={busy}>Cancel</Button><Button type="button" className="bg-red-600 hover:bg-red-700" onClick={remove} disabled={busy}>{busy ? "Deleting…" : "Delete document"}</Button></div>
  </div>;
}

// Admin-only menu on a document row.
export function ProjectDocumentActions({ document }: { document: EditableDocument }) {
  const [mode, setMode] = useState<"edit" | "delete" | null>(null);
  return <>
    <RecordActionMenu name={document.file_name} actions={[
      { label: "Edit details", onSelect: () => setMode("edit") },
      { label: "Delete document", destructive: true, onSelect: () => setMode("delete") },
    ]} />
    {mode && <RecordCreateDialog title={mode === "edit" ? "Edit document" : "Delete document"} hideTrigger initialOpen onClosed={() => setMode(null)}>
      {mode === "edit" ? <EditDocumentForm document={document} /> : <DeleteDocumentForm document={document} />}
    </RecordCreateDialog>}
  </>;
}
