"use client";

import { useRouter } from "next/navigation";
import { SelectPicker } from "@/components/ui/select-picker";
import type { ProjectDocumentCategory } from "@/types/database";

type DocumentProject = { id: string; code: string; name: string };

const categoryOptions = [
  { value: "all", label: "All types" },
  { value: "initial", label: "Initial documents" },
  { value: "other", label: "Other documents" },
] as const;

export function DocumentFilters({ projects, query, projectId, category }: {
  projects: readonly DocumentProject[];
  query: string;
  projectId: string;
  category: ProjectDocumentCategory | "all";
}) {
  const router = useRouter();
  function update(nextProjectId: string, nextCategory: string) {
    const params = new URLSearchParams();
    if (query) params.set("q", query);
    if (nextProjectId && nextProjectId !== "all") params.set("project", nextProjectId);
    if (nextCategory !== "all") params.set("category", nextCategory);
    router.push(`/documents${params.size ? `?${params}` : ""}`, { scroll: false });
  }

  return <>
    <div className="w-full sm:w-64"><SelectPicker label="Filter by project" value={projectId || "all"} onValueChange={(value) => update(value, category)} options={[{ value: "all", label: "All projects" }, ...projects.map((project) => ({ value: project.id, label: `${project.code} · ${project.name}` }))]} /></div>
    <div className="w-full sm:w-44"><SelectPicker label="Filter by document type" value={category} onValueChange={(value) => update(projectId, value)} options={categoryOptions} /></div>
  </>;
}
