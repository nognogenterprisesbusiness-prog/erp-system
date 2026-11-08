import Link from "next/link";
import { notFound } from "next/navigation";
import QRCode from "qrcode";
import { uuidSchema } from "@nognog/domain";
import { PrintCardsButton } from "@/components/workforce/id-card-forms";
import { requireUser } from "@/lib/auth";
import { createClient } from "@/lib/supabase/server";

export const metadata = { title: "Worker ID cards" };

/** Printable worker ID cards (credit-card size). Admin only: the QR code is what the Foreman scans for attendance. */
export default async function WorkerIdCardsPage({ searchParams }: { searchParams: Promise<Record<string, string | string[] | undefined>> }) {
  if (!(await requireUser()).canManage) notFound();
  const params = await searchParams;
  const employeeId = uuidSchema.safeParse(params.employee), projectId = uuidSchema.safeParse(params.project);
  const supabase = await createClient();

  let employeeQuery = supabase.from("employees").select("id,code,first_name,last_name,category_id").is("archived_at", null).eq("status", "active").order("last_name").order("first_name").limit(1000);
  if (employeeId.success) employeeQuery = employeeQuery.eq("id", employeeId.data);
  const [employees, cards, categories, assignments, project] = await Promise.all([
    employeeQuery,
    supabase.from("employee_id_cards").select("employee_id,public_identifier").eq("status", "active").limit(5000),
    supabase.from("employee_categories").select("id,name"),
    projectId.success ? supabase.from("employee_project_assignments").select("employee_id").eq("project_id", projectId.data).eq("status", "active") : Promise.resolve(null),
    projectId.success ? supabase.from("projects").select("name").eq("id", projectId.data).maybeSingle() : Promise.resolve(null),
  ]);
  if (employees.error || cards.error) throw new Error("Worker ID cards could not be loaded.");
  const onProject = assignments?.data ? new Set(assignments.data.map((row) => row.employee_id)) : null;
  const cardOf = new Map(cards.data.map((card) => [card.employee_id, card.public_identifier]));
  const categoryOf = new Map((categories.data ?? []).map((category) => [category.id, category.name]));
  const rows = await Promise.all(employees.data
    .filter((employee) => cardOf.has(employee.id) && (!onProject || onProject.has(employee.id)))
    .map(async (employee) => {
      const identifier = cardOf.get(employee.id)!;
      return { ...employee, identifier, svg: await QRCode.toString(identifier, { type: "svg", errorCorrectionLevel: "Q", margin: 2 }) };
    }));
  const back = employeeId.success ? `/employees/${employeeId.data}` : "/employees";

  return <main className="min-h-svh bg-white p-6 text-[#07152d] print:p-0">
    <style>{"@page { size: A4; margin: 10mm; }"}</style>
    <div className="mx-auto mb-6 flex max-w-4xl flex-wrap items-center justify-between gap-3 print:hidden">
      <div><Link href={back} className="text-sm text-cyan-700 hover:underline">← Back</Link><h1 className="mt-2 text-xl font-semibold">Worker ID cards</h1><p className="mt-1 text-sm text-slate-500">{rows.length} card{rows.length === 1 ? "" : "s"}{project?.data ? ` · ${project.data.name}` : ""}. Print, cut and laminate. Foremen scan these in Attendance.</p></div>
      {rows.length > 0 && <PrintCardsButton label="Print cards" />}
    </div>
    {rows.length === 0 ? <p className="mx-auto max-w-4xl text-sm text-slate-500">No active employees to print.</p> :
      <div className="mx-auto grid max-w-4xl grid-cols-1 justify-items-center gap-4 sm:grid-cols-2 print:grid-cols-2 print:gap-[4mm]">
        {rows.map((row) => <article key={row.id} className="flex h-[54mm] w-[85.6mm] break-inside-avoid items-center gap-[4mm] overflow-hidden rounded-[3mm] border border-slate-400 p-[4mm]">
          <div className="size-[38mm] shrink-0 [&>svg]:size-full" role="img" aria-label={`QR code for ${row.first_name} ${row.last_name}`} dangerouslySetInnerHTML={{ __html: row.svg }} />
          <div className="min-w-0">
            <p className="text-[9pt] font-bold tracking-[0.14em]">NOGNOG</p>
            <p className="text-[7pt] uppercase tracking-wide text-slate-500">Worker ID</p>
            <p className="mt-[3mm] text-[11pt] font-semibold leading-tight break-words">{row.first_name} {row.last_name}</p>
            <p className="mt-[1mm] text-[8pt] text-slate-600">{row.code}</p>
            <p className="text-[8pt] text-slate-600 break-words">{categoryOf.get(row.category_id) ?? ""}</p>
          </div>
        </article>)}
      </div>}
  </main>;
}
