"use client";

import { getFieldPlaceholder } from "@/components/ui/field-placeholder";
import { useEffect, useRef, useState, type FormEvent } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { SelectPicker } from "@/components/ui/select-picker";
import { useRecordDialog } from "@/components/ui/record-create-dialog";
import { attachProjectDocumentsAction } from "@/app/(workspace)/projects/document-actions";
import { createClient } from "@/lib/supabase/browser";
import {
  isProjectDocumentContentType,
  projectDocumentAccept,
  projectDocumentCategories,
  projectDocumentMaxBytes,
  projectDocumentMaxFiles,
  projectDocumentTypes,
  type ProjectDocumentContentType,
} from "@/lib/project-documents";
import type { ProjectDocumentCategory } from "@/types/database";

type DocumentProject = { id: string; code: string; name: string };

type UploadDocument = { id: string; fileName: string; contentType: ProjectDocumentContentType; fileSize: number };

function contentTypeFor(file: File): ProjectDocumentContentType | null {
  const extension = `.${file.name.split(".").pop()?.toLowerCase() ?? ""}`;
  const byExtension = Object.entries(projectDocumentTypes).find(([, extensions]) => (extensions as readonly string[]).includes(extension))?.[0] as ProjectDocumentContentType | undefined;
  if (!byExtension) return null;
  return !file.type || !isProjectDocumentContentType(file.type) || file.type === byExtension ? byExtension : null;
}

export function ProjectDocumentUpload({ projects, initialProjectId = "" }: { projects: readonly DocumentProject[]; initialProjectId?: string }) {
  const dialog = useRecordDialog();
  const input = useRef<HTMLInputElement>(null);
  const [projectId, setProjectId] = useState(projects.some((project) => project.id === initialProjectId) ? initialProjectId : "");
  const [category, setCategory] = useState<ProjectDocumentCategory>("initial");
  // Each chosen file needs a name typed by the uploader; the file name is only a hint.
  const [selected, setSelected] = useState<File[]>([]);
  const [names, setNames] = useState<string[]>([]);
  const [uploading, setUploading] = useState(false);
  const [message, setMessage] = useState("");
  const [error, setError] = useState(false);
  useEffect(() => { dialog?.setBusy(uploading); }, [dialog, uploading]);

  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const files = selected;
    setMessage("");
    setError(false);

    if (!projectId || !projects.some((project) => project.id === projectId)) {
      setError(true);
      setMessage("Choose the project these documents belong to.");
      return;
    }
    if (!files.length) {
      setError(true);
      setMessage("Choose one or more documents to upload.");
      return;
    }
    if (files.length > projectDocumentMaxFiles) {
      setError(true);
      setMessage(`Upload up to ${projectDocumentMaxFiles} files at a time.`);
      return;
    }

    const missing = names.findIndex((name) => !name.trim());
    if (missing >= 0) {
      setError(true);
      setMessage(`Enter a document name for ${files[missing].name}.`);
      document.getElementById(`documentName-${missing}`)?.focus();
      return;
    }

    const documents: UploadDocument[] = [];
    for (const [index, file] of files.entries()) {
      const contentType = contentTypeFor(file);
      if (!contentType) {
        setError(true);
        setMessage(`${file.name} is not a supported file type.`);
        return;
      }
      if (!file.size || file.size > projectDocumentMaxBytes) {
        setError(true);
        setMessage(`${file.name} must be smaller than 10 MB.`);
        return;
      }
      documents.push({ id: crypto.randomUUID(), fileName: names[index].trim(), contentType, fileSize: file.size });
    }

    setUploading(true);
    const supabase = createClient();
    const uploadedPaths: string[] = [];
    try {
      for (const [index, file] of files.entries()) {
        const path = `${projectId}/${documents[index].id}`;
        uploadedPaths.push(path);
        const result = await supabase.storage.from("erp-project-documents").upload(path, file, {
          upsert: false,
          contentType: documents[index].contentType,
          cacheControl: "3600",
        });
        if (result.error) throw new Error(`${file.name} could not be uploaded. Check the file and try again.`);
        setMessage(`Uploading ${index + 1} of ${files.length}…`);
      }
    } catch (cause) {
      if (uploadedPaths.length) await supabase.storage.from("erp-project-documents").remove(uploadedPaths);
      setUploading(false);
      setError(true);
      setMessage(cause instanceof Error ? cause.message : "The documents could not be uploaded. Please try again.");
      return;
    }

    const form = new FormData();
    form.set("projectId", projectId);
    form.set("category", category);
    form.set("documents", JSON.stringify(documents));
    let result: Awaited<ReturnType<typeof attachProjectDocumentsAction>>;
    try {
      result = await attachProjectDocumentsAction(form);
    } catch {
      setUploading(false);
      setError(true);
      setMessage("We could not confirm the save. Refresh the project documents before trying again.");
      return;
    }

    if (!result.ok) {
      await supabase.storage.from("erp-project-documents").remove(uploadedPaths);
      setUploading(false);
      setError(true);
      setMessage(result.message);
      return;
    }

    if (input.current) input.current.value = "";
    setSelected([]);
    setNames([]);
    setUploading(false);
    setMessage(result.message);
  }

  return <form onSubmit={submit} className="space-y-5">
    <div>
      <label htmlFor="documentProject" className="mb-2 block text-sm font-medium text-slate-700">Project</label>
      <SelectPicker id="documentProject" label="Project" value={projectId} onValueChange={setProjectId} options={projects.map((project) => ({ value: project.id, label: `${project.code} · ${project.name}` }))} placeholder="Choose a project" disabled={uploading} required />

    </div>
    <div className="grid gap-4 sm:grid-cols-2">
      <div>
        <label htmlFor="documentCategory" className="mb-2 block text-sm font-medium text-slate-700">Document type</label>
        <SelectPicker id="documentCategory" label="Document type" value={category} onValueChange={(value) => setCategory(value as ProjectDocumentCategory)} options={projectDocumentCategories} disabled={uploading} />
      </div>
      <div>
        <label htmlFor="projectDocuments" className="mb-2 block text-sm font-medium text-slate-700">Files</label>
        <input ref={input} id="projectDocuments" type="file" multiple accept={projectDocumentAccept} disabled={uploading} onChange={(event) => { const files = [...(event.currentTarget.files ?? [])]; setSelected(files); setNames(files.map(() => "")); setMessage(""); setError(false); }} className="block min-h-10 w-full rounded-lg border border-slate-200 bg-white text-sm text-slate-600 file:mr-3 file:h-10 file:border-0 file:bg-slate-100 file:px-3 file:text-sm file:font-medium file:text-slate-700 hover:file:bg-slate-200 disabled:opacity-50" />
        <p className="mt-1.5 text-xs text-slate-500">PDF, Word, Excel, CSV, text, or PNG/JPG · up to 10 files, 10 MB each</p>
      </div>
    </div>
    {selected.length > 0 && <fieldset className="space-y-3">
      <legend className="mb-2 text-sm font-medium text-slate-700">Document names</legend>
      {selected.map((file, index) => <div key={`${file.name}-${file.size}-${index}`}>
        <label htmlFor={`documentName-${index}`} className="sr-only">Name for {file.name}</label>
        <Input id={`documentName-${index}`} value={names[index] ?? ""} onChange={(event) => { const value = event.currentTarget.value; setNames((current) => current.map((name, position) => position === index ? value : name)); }} maxLength={180} required disabled={uploading} placeholder={getFieldPlaceholder("Document name")} />

        <p className="mt-1 truncate text-xs text-slate-500" title={file.name}>File: {file.name}</p>
      </div>)}
    </fieldset>}
    <div className="flex justify-end"><Button type="submit" disabled={uploading || projects.length === 0}>{uploading ? "Uploading…" : "Upload documents"}</Button></div>
    {message && <p role={error ? "alert" : "status"} aria-live="polite" className={`mt-3 text-sm ${error ? "text-red-700" : "text-slate-600"}`}>{message}</p>}
  </form>;
}
