import { NextResponse } from "next/server";
import { uuidSchema } from "@nognog/domain";
import { requireUser } from "@/lib/auth";
import { safeAccountSearchTerm, safeSearchTerm } from "@/lib/data/search";
import { createClient } from "@/lib/supabase/server";

function privateJson(body: unknown, init: { status?: number; headers?: HeadersInit } = {}) {
  return NextResponse.json(body, { status: init.status ?? 200, headers: { "Cache-Control": "private, no-store" } });
}

export async function GET(request: Request) {
  const user = await requireUser();
  const params = new URL(request.url).searchParams;
  const kind = params.get("kind") ?? "";
  const query = params.get("q") ?? "";
  const page = Number(params.get("page") ?? 1);
  if (!Number.isSafeInteger(page) || page < 1 || (page - 1) * 20 > 2147483647) return privateJson({ message: "Invalid page." }, { status: 400 });
  const selected = params.get("selected");
  const project = params.get("project");
  if (!["asset_location", "profile", "project", "employee", "site"].includes(kind) || query.length > 100 || (selected && !uuidSchema.safeParse(selected).success) || (project && !uuidSchema.safeParse(project).success)) return privateJson({ message: "Invalid search." }, { status: 400 });
  const client = await createClient();
  if (user.roles.includes("hr") && !user.canManage && (kind === "project" || kind === "site")) {
    if (kind === "site" && !project) return privateJson({ choices: [], count: 0 });
    const { data, error } = await client.rpc("get_hr_workforce_references", { p_kind: kind, p_ids: selected ? [selected] : null, p_query: query, p_project_id: project, p_offset: (page - 1) * 20, p_limit: 20 });
    if (error) return privateJson({ message: "Choices could not be loaded. Try again." }, { status: 503 });
    return privateJson({ choices: data.map(row => ({ value: row.id, label: row.name, secondary: row.code ?? undefined })), count: data[0]?.total_count ?? 0 });
  }
  if (kind !== "asset_location") {
    if (kind === "profile" ? !user.canManage : !user.canViewPayroll) return privateJson({ message: "Staff access required." }, { status: 403 });
    const term = kind === "profile" ? safeAccountSearchTerm(query) : safeSearchTerm(query);
    const from = (page - 1) * 20;
    let result;
    if (kind === "profile") {
      let read = client.from("profiles").select("id,full_name,email", { count: "exact" }).order("full_name").order("id");
      read = selected ? read.eq("id", selected) : read.eq("is_active", true);
      if (term) read = read.or(`full_name.ilike.%${term}%,email.ilike.%${term}%`);
      const rows = await read.range(from, from + 19);
      result = { ...rows, choices: rows.data?.map(row => ({ value: row.id, label: row.full_name, secondary: row.email })) };
    } else if (kind === "employee") {
      let read = client.from("employees").select("id,first_name,middle_name,last_name,code", { count: "exact" }).is("archived_at", null).eq("status", "active").order("last_name").order("first_name").order("id");
      if (selected) read = read.eq("id", selected);
      if (term) read = read.or(`and(${term.split(/\s+/).map(word => `or(first_name.ilike.%${word}%,middle_name.ilike.%${word}%,last_name.ilike.%${word}%,code.ilike.%${word}%)`).join(",")})`);
      const rows = await read.range(from, from + 19);
      result = { ...rows, choices: rows.data?.map(row => ({ value: row.id, label: [row.first_name,row.middle_name,row.last_name].filter(Boolean).join(" "), secondary: row.code })) };
    } else if (kind === "site") {
      if (!project) return privateJson({ choices: [], count: 0 }, { headers: { "Cache-Control": "private, no-store" } });
      let read = client.from("project_sites").select("id,name", { count: "exact" }).eq("project_id", project).eq("status", "active").order("name").order("id");
      if (selected) read = read.eq("id", selected);
      if (term) read = read.ilike("name", `%${term}%`);
      const rows = await read.range(from, from + 19);
      result = { ...rows, choices: rows.data?.map(row => ({ value: row.id, label: row.name })) };
    } else {
      let read = client.from("projects").select("id,name,code", { count: "exact" }).is("archived_at", null).not("status", "in", "(completed,cancelled)").order("name").order("id");
      if (selected) read = read.eq("id", selected);
      if (term) read = read.or(`name.ilike.%${term}%,code.ilike.%${term}%`);
      const rows = await read.range(from, from + 19);
      result = { ...rows, choices: rows.data?.map(row => ({ value: row.id, label: row.name, secondary: row.code })) };
    }
    if (result.error) return privateJson({ message: "Choices could not be loaded. Try again." }, { status: 503 });
    return privateJson({ choices: result.choices ?? [], count: result.count ?? 0 }, { headers: { "Cache-Control": "private, no-store" } });
  }
  const { data, error } = await client.rpc("search_registry_choices", { p_kind: kind, p_search: query, p_limit: 20, p_offset: (page - 1) * 20, p_selected: selected });
  if (error) return privateJson({ message: "Choices could not be loaded. Try again." }, { status: 503 });
  return privateJson({ choices: data.map(row => ({ value: row.id, label: row.name, secondary: row.code })), count: Number(data[0]?.total_count ?? 0) }, { headers: { "Cache-Control": "private, no-store" } });
}
