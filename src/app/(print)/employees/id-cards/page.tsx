import Link from "next/link";
import { notFound } from "next/navigation";
import { uuidSchema } from "@nognog/domain";
import { PrintCardsButton } from "@/components/workforce/id-card-forms";
import { WorkerIdCardSheet } from "@/components/workforce/worker-id-card-sheet";
import { getWorkerIdCards } from "@/lib/data/worker-id-cards";
import { requireUser } from "@/lib/auth";

export const metadata = { title: "Worker ID cards" };

export default async function WorkerIdCardsPage({ searchParams }: { searchParams: Promise<Record<string, string | string[] | undefined>> }) {
  if (!(await requireUser()).canManage) notFound();
  const params = await searchParams;
  const employee = uuidSchema.safeParse(params.employee), project = uuidSchema.safeParse(params.project);
  const data = await getWorkerIdCards({ employeeId: employee.success ? employee.data : undefined, projectId: project.success ? project.data : undefined });
  return <main className="min-h-svh bg-white p-6 text-[#07152d] print:p-0"><div className="mx-auto mb-6 flex max-w-4xl flex-wrap items-center justify-between gap-3 print:hidden"><div><Link href={employee.success ? `/employees/${employee.data}` : "/employees"} className="text-sm text-cyan-700 hover:underline">← Back</Link><h1 className="mt-2 text-xl font-semibold">Worker ID cards</h1><p className="mt-1 text-sm text-slate-500">{data.rows.length} cards. Print, cut and laminate.</p></div>{data.rows.length > 0 && <PrintCardsButton label="Print cards" />}</div>{data.rows.length ? <WorkerIdCardSheet data={data} /> : <p className="mx-auto max-w-4xl text-sm text-slate-500">No active employees to print.</p>}</main>;
}
