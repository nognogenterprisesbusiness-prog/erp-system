import { readAllPages } from "@/lib/data/read-all-pages";
import { uuidSchema } from "@nognog/domain";
import { requireFinanceViewer } from "@/lib/auth";
import { streamCsvAttachment } from "@/lib/export/csv";
import { createClient } from "@/lib/supabase/server";

export async function GET(_: Request, context: { params: Promise<{ id: string }> }) {
  await requireFinanceViewer();
  const id = uuidSchema.safeParse((await context.params).id);
  if (!id.success) return new Response(null, { status: 404 });
  const supabase = await createClient();
  const [run, departments] = await Promise.all([
    supabase.from("payroll_runs").select("payroll_number,period_start,period_end,pay_date,status").eq("id", id.data).maybeSingle(),
    readAllPages((from,to)=>supabase.from("departments").select("id,name").order("id").range(from,to),"departments").then(data=>({data,error:null})),
  ]);
  if (run.error || departments.error || !run.data) return new Response(null, { status: 404 });
  const departmentName = new Map(departments.data.map((item) => [item.id, item.name]));
  async function* batches() {
    for (let from = 0; ; from += 500) {
      const { data: lines, error } = await supabase.from("payroll_lines").select("*").eq("run_id", id.data!).order("employee_name").order("id").range(from, from + 499);
      if (error) throw new Error("Payroll export could not be completed.");
      if (!lines?.length) return;
      yield lines.map((line) => [run.data!.payroll_number, run.data!.period_start, run.data!.period_end, run.data!.pay_date, run.data!.status, line.employee_code, line.employee_name,
        line.department_id ? departmentName.get(line.department_id) ?? "" : "", line.days_worked, Number(line.attendance_pay).toFixed(2), Number(line.other_earnings).toFixed(2), Number(line.deductions).toFixed(2), Number(line.net_pay).toFixed(2), line.notes]);
      if (lines.length < 500) return;
    }
  }
  return streamCsvAttachment(`${run.data.payroll_number}.csv`,
    ["Payroll", "Period start", "Period end", "Pay date", "Status", "Employee code", "Employee", "Department", "Days", "Attendance pay", "Other earnings", "Deductions", "Net pay", "Note"],
    batches());
}
