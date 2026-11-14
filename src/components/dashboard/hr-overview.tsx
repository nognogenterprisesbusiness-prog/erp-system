import { UserGroupIcon, Money03Icon, AssignmentsIcon } from "@hugeicons/core-free-icons";
import { Button } from "@/components/ui/button";
import { MetricCard } from "@/components/ui/metric-card";
import { IntentLink as Link } from "@/components/layout/intent-link";
import { requireWorkforceManagerPage } from "@/lib/auth";
import { createClient } from "@/lib/supabase/server";

export async function HrOverview() {
  await requireWorkforceManagerPage();
  const db = await createClient();
  const results = await Promise.all([
    db.from("employees").select("id", { head: true, count: "exact" }).is("archived_at", null).eq("status", "active"),
    db.from("payroll_runs").select("id", { head: true, count: "exact" }).eq("status", "draft"),
    db.from("departments").select("id", { head: true, count: "exact" }).is("archived_at", null),
  ]);
  if (results.some(result => result.error)) throw new Error("The HR overview could not be loaded.");
  return <>
    <h1 className="text-2xl font-semibold tracking-tight sm:text-3xl">HR overview</h1>
    <p className="mt-2 text-sm text-slate-500">Employee records, attendance review and payroll preparation.</p>
    <section className="mt-6 grid gap-4 md:grid-cols-3" aria-label="HR overview">
      <MetricCard label="Active employees" value={results[0].count ?? 0} icon={UserGroupIcon} tone="bg-cyan-50 text-cyan-700" />
      <MetricCard label="Draft payrolls" value={results[1].count ?? 0} icon={Money03Icon} tone="bg-amber-50 text-amber-700" detail="Prepare entries, then ask Admin to finalize." />
      <MetricCard label="Departments" value={results[2].count ?? 0} icon={AssignmentsIcon} tone="bg-blue-50 text-blue-700" />
    </section>
    <section className="mt-6 grid gap-4 md:grid-cols-3" aria-label="Daily HR work">
      {[
        { title: "Employees", detail: "Maintain employee details, assignments and ID cards.", href: "/employees" },
        { title: "Attendance", detail: "Review recorded hours and supporting ID scans and photos.", href: "/attendance" },
        { title: "Payroll", detail: "Choose the period and review earnings and deductions.", href: "/payroll" },
      ].map(item => <article key={item.href} className="flex flex-col items-start rounded-xl border border-slate-200 bg-white p-5"><h2 className="font-semibold">{item.title}</h2><p className="mb-5 mt-2 flex-1 text-sm leading-6 text-slate-500">{item.detail}</p><Button variant="outline" asChild><Link href={item.href}>Open {item.title.toLowerCase()}</Link></Button></article>)}
    </section>
  </>;
}
