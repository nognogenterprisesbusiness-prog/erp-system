import "server-only";

import { cache } from "react";
import { createClient } from "@/lib/supabase/server";
import { safeSearchTerm } from "./search";
import { projectDocumentFileKinds, type ProjectDocumentFileKind } from "@/lib/project-documents";
import type { ProjectDocumentCategory } from "@/types/database";

const PAGE_SIZE = 20;
const PROJECT_BATCH_SIZE = 1000;

export type DocumentFilters = {
  query: string;
  projectId: string;
  category: ProjectDocumentCategory | "all";
  fileKind: ProjectDocumentFileKind | "all";
  page: number;
};

export const getDocumentProjects = cache(async function getDocumentProjects() {
  const supabase = await createClient();
  const projects: { id: string; code: string; name: string }[] = [];
  for (let offset = 0; ; offset += PROJECT_BATCH_SIZE) {
    const { data, error } = await supabase.from("projects")
      .select("id,code,name")
      .is("archived_at", null)
      .order("name")
      .order("id")
      .range(offset, offset + PROJECT_BATCH_SIZE - 1);
    if (error) throw new Error(`Unable to load projects: ${error.message}`, { cause: error });
    projects.push(...(data ?? []));
    if (!data || data.length < PROJECT_BATCH_SIZE) return projects;
  }
});

export async function getDocumentPage({ query, projectId, category, fileKind, page }: DocumentFilters) {
  const supabase = await createClient();
  const from = (page - 1) * PAGE_SIZE;
  let request = supabase.from("project_documents")
    .select("id,project_id,category,file_name,content_type,file_size,uploaded_by,created_at", { count: "exact" });
  if (projectId) request = request.eq("project_id", projectId);
  if (category !== "all") request = request.eq("category", category);
  if (fileKind !== "all") request = request.in("content_type", [...projectDocumentFileKinds[fileKind].types]);
  const search = safeSearchTerm(query);
  if (search) request = request.ilike("file_name", `%${search}%`);
  const { data, count, error } = await request
    .order("created_at", { ascending: false })
    .order("id", { ascending: false })
    .range(from, from + PAGE_SIZE - 1);
  if (error) throw new Error(`Unable to load documents: ${error.message}`, { cause: error });

  const documents = data ?? [];
  const projectIds = [...new Set(documents.map((document) => document.project_id))];
  const uploaderIds = [...new Set(documents.map((document) => document.uploaded_by))];
  const [{ data: projects, error: projectError }, { data: uploaders }] = await Promise.all([
    projectIds.length ? supabase.from("projects").select("id,code,name").in("id", projectIds) : Promise.resolve({ data: [], error: null }),
    // Profile visibility is role-scoped; a hidden uploader simply shows no name.
    uploaderIds.length ? supabase.from("profiles").select("id,full_name").in("id", uploaderIds) : Promise.resolve({ data: [] }),
  ]);
  if (projectError) throw new Error(`Unable to load document projects: ${projectError.message}`, { cause: projectError });
  const names = new Map((projects ?? []).map((project) => [project.id, project]));
  const uploaderNames = new Map((uploaders ?? []).map((profile) => [profile.id, profile.full_name]));
  return {
    documents: documents.map((document) => ({ ...document, project: names.get(document.project_id) ?? null, uploaderName: uploaderNames.get(document.uploaded_by) ?? null })),
    count: count ?? 0,
    page,
    pageCount: Math.max(1, Math.ceil((count ?? 0) / PAGE_SIZE)),
  };
}

export async function getDocumentCounts() {
  const supabase = await createClient();
  const results = await Promise.all([
    supabase.from("project_documents").select("id", { count: "exact", head: true }),
    supabase.from("project_documents").select("id", { count: "exact", head: true }).eq("category", "initial"),
    supabase.from("project_documents").select("id", { count: "exact", head: true }).eq("category", "other"),
  ]);
  for (const result of results) if (result.error) throw new Error(`Unable to load document totals: ${result.error.message}`, { cause: result.error });
  return { total: results[0].count ?? 0, initial: results[1].count ?? 0, other: results[2].count ?? 0 };
}
