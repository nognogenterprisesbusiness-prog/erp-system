"use client";

import { useRouter } from "next/navigation";

import { SelectPicker } from "@/components/ui/select-picker";

const statuses = [
  { value: "all", label: "All statuses" },
  { value: "draft", label: "Draft" },
  { value: "active", label: "Active" },
  { value: "on_hold", label: "On hold" },
  { value: "completed", label: "Completed" },
  { value: "cancelled", label: "Cancelled" },
] as const;

const sorts = [
  { value: "newest:desc", label: "Newest first" },
  { value: "newest:asc", label: "Oldest first" },
  { value: "code:asc", label: "Code A–Z" },
  { value: "code:desc", label: "Code Z–A" },
  { value: "name:asc", label: "Name A–Z" },
  { value: "name:desc", label: "Name Z–A" },
  { value: "client:asc", label: "Client A–Z" },
  { value: "client:desc", label: "Client Z–A" },
  { value: "target:asc", label: "Target earliest" },
  { value: "target:desc", label: "Target latest" },
  { value: "budget:asc", label: "Budget low–high" },
  { value: "budget:desc", label: "Budget high–low" },
  { value: "status:asc", label: "Status A–Z" },
  { value: "status:desc", label: "Status Z–A" },
] as const;

export function ProjectListPickers({ query, status, sort, direction }: { query: string; status: string; sort: string; direction: "asc" | "desc" }) {
  const router = useRouter();
  function navigate(nextStatus: string, nextSort: string, nextDirection: string) {
    const params = new URLSearchParams();
    if (query) params.set("q", query);
    if (nextStatus !== "all") params.set("status", nextStatus);
    if (nextSort !== "newest") params.set("sort", nextSort);
    if (nextDirection !== "desc") params.set("direction", nextDirection);
    router.push(`/projects?${params}`);
  }

  return <div className="flex w-full flex-wrap gap-3 sm:w-auto">
    <div className="w-full sm:w-40"><SelectPicker label="Filter projects by status" options={statuses} value={status} onValueChange={(value) => navigate(value, sort, direction)} /></div>
    <div className="w-full sm:w-44"><SelectPicker label="Sort projects" options={sorts} value={`${sort}:${direction}`} onValueChange={(value) => { const [nextSort, nextDirection] = value.split(":"); navigate(status, nextSort, nextDirection); }} /></div>
  </div>;
}
