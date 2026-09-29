"use server";

import { revalidatePath } from "next/cache";
import { requireManager } from "@/lib/auth";
import { projectDocumentMaxBytes, isProjectDocumentContentType } from "@/lib/project-documents";
import { createClient } from "@/lib/supabase/server";
import type { ProjectDocumentCategory } from "@/types/database";

const uuidPattern = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
const validCategories = new Set<ProjectDocumentCategory>(["initial", "other"]);

type DocumentInput = { id: string; fileName: string; contentType: string; fileSize: number };
type DocumentResult = { ok: boolean; message: string };

function safeFileName(value: unknown) {
  if (typeof value !== "string") return "";
  return value.replaceAll("\\", "/").split("/").pop()?.replace(/[\u0000-\u001f\u007f]/g, "").trim().slice(0, 180) ?? "";
}

export async function attachProjectDocumentsAction(form: FormData): Promise<DocumentResult> {
  let actor;
  try { actor = await requireManager(); } catch { return { ok: false, message: "You do not have permission to upload project documents." }; }

  const projectId = String(form.get("projectId") ?? "");
  const category = String(form.get("category") ?? "") as ProjectDocumentCategory;
  let documents: unknown;
  try { documents = JSON.parse(String(form.get("documents") ?? "")); } catch { return { ok: false, message: "The upload details are invalid. Please choose the files again." }; }

  if (!uuidPattern.test(projectId) || !validCategories.has(category) || !Array.isArray(documents) || !documents.length || documents.length > 10) {
    return { ok: false, message: "The upload details are invalid. Please choose the files again." };
  }

  const rows: DocumentInput[] = [];
  for (const value of documents) {
    if (!value || typeof value !== "object") return { ok: false, message: "The upload details are invalid. Please choose the files again." };
    const item = value as Record<string, unknown>;
    const fileName = safeFileName(item.fileName);
    if (!uuidPattern.test(String(item.id ?? "")) || !fileName || !isProjectDocumentContentType(String(item.contentType ?? ""))
      || !Number.isSafeInteger(item.fileSize) || Number(item.fileSize) < 1 || Number(item.fileSize) > projectDocumentMaxBytes) {
      return { ok: false, message: "One or more files are not supported. Choose a supported file under 10 MB." };
    }
    rows.push({ id: String(item.id), fileName, contentType: String(item.contentType), fileSize: Number(item.fileSize) });
  }

  if (new Set(rows.map((row) => row.id)).size !== rows.length) return { ok: false, message: "The upload contains duplicate files. Please try again." };

  const supabase = await createClient();
  const storage = supabase.storage.from("erp-project-documents");
  const objects = await Promise.all(rows.map(async (row) => {
    const result = await storage.list(projectId, { limit: 2, search: row.id });
    const object = result.data?.find((entry) => entry.name === row.id);
    const metadata = object?.metadata as { mimetype?: unknown; size?: unknown } | null | undefined;
    return !result.error && metadata?.mimetype === row.contentType && Number(metadata.size) === row.fileSize;
  }));
  if (objects.some((exists) => !exists)) return { ok: false, message: "We could not verify one of the uploaded files. Please try the upload again." };

  const { error } = await supabase.from("project_documents").insert(rows.map((row) => ({
    id: row.id,
    project_id: projectId,
    category,
    file_name: row.fileName,
    content_type: row.contentType,
    file_size: row.fileSize,
    storage_path: `${projectId}/${row.id}`,
    uploaded_by: actor.userId,
  })));
  if (error) return { ok: false, message: "The documents could not be saved. Please try again." };

  revalidatePath(`/projects/${projectId}`);
  revalidatePath("/documents");
  return { ok: true, message: `${rows.length} document${rows.length === 1 ? "" : "s"} uploaded.` };
}
