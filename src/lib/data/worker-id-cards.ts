import { readAllPages } from "./read-all-pages";
import "server-only";
import QRCode from "qrcode";
import { requireManager } from "@/lib/auth";
import { createClient } from "@/lib/supabase/server";

export async function getWorkerIdCards({ employeeId, projectId }: { employeeId?: string; projectId?: string }) {
  await requireManager();
  const supabase = await createClient();

  let employeeQuery = supabase.from("employees").select("id,code,first_name,last_name,category_id").is("archived_at", null).eq("status", "active").order("last_name").order("first_name").order("id");
  if (employeeId) employeeQuery = employeeQuery.eq("id", employeeId);
  const [employees, cards, categories, assignments, project] = await Promise.all([
    readAllPages((from,to)=>employeeQuery.range(from,to),"worker cards").then(data=>({data,error:null})),
    readAllPages((from,to)=>supabase.from("employee_id_cards").select("employee_id,public_identifier").eq("status", "active").order("id").range(from,to),"active worker cards").then(data=>({data,error:null})),
    supabase.from("employee_categories").select("id,name"),
    projectId ? supabase.from("employee_project_assignments").select("employee_id").eq("project_id", projectId).eq("status", "active") : Promise.resolve(null),
    projectId ? supabase.from("projects").select("name").eq("id", projectId).maybeSingle() : Promise.resolve(null),
  ]);
  if (employees.error || cards.error || categories.error || assignments?.error || project?.error) throw new Error("Worker ID cards could not be loaded.");
  const onProject = assignments?.data ? new Set(assignments.data.map((row) => row.employee_id)) : null;
  const cardOf = new Map(cards.data.map((card) => [card.employee_id, card.public_identifier]));
  const categoryOf = new Map((categories.data ?? []).map((category) => [category.id, category.name]));
  const rows = await Promise.all(employees.data
    .filter((employee) => cardOf.has(employee.id) && (!onProject || onProject.has(employee.id)))
    .map(async (employee) => {
      const identifier = cardOf.get(employee.id)!;
      return { ...employee, categoryName: categoryOf.get(employee.category_id) ?? "", svg: await QRCode.toString(identifier, { type: "svg", errorCorrectionLevel: "Q", margin: 2 }) };
    }));
  return { rows, projectName: project?.data?.name ?? null };
}
