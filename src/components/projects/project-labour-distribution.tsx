import { EmptyState } from "@/components/ui/empty-state";
import type { getProjectWorkforce } from "@/lib/data/workforce";

const money = new Intl.NumberFormat("en-PH", { style: "currency", currency: "PHP" });

export function ProjectLabourDistribution({ workforce, canViewRates }: {
  workforce: Awaited<ReturnType<typeof getProjectWorkforce>>;
  canViewRates: boolean;
}) {
  const employees = new Set<string>();
  const groups = new Map<string, { count: number; dailyRates: number[] }>();
  for (const assignment of workforce.assignments) {
    if (assignment.status !== "active" || employees.has(assignment.employee_id)) continue;
    employees.add(assignment.employee_id);
    const role = assignment.position_title || assignment.categoryName;
    const group = groups.get(role) ?? { count: 0, dailyRates: [] };
    group.count += 1;
    const rate = assignment.currentRates.find((item) => item.rate_type === "daily");
    if (rate) group.dailyRates.push(Number(rate.rate_amount));
    groups.set(role, group);
  }
  return <section className="overflow-hidden rounded-2xl border border-slate-200 bg-white p-5 sm:p-6">
    <h2 className="text-base font-semibold">Labour distribution</h2>
    {groups.size === 0 ? <EmptyState compact title="No workers assigned" /> : <div className="mt-4 overflow-x-auto"><table className="w-full min-w-[480px] text-left text-sm">
      <thead className="border-b border-slate-100 text-slate-500"><tr><th className="py-3 font-medium">Role</th><th className="py-3 text-right font-medium">Count</th>{canViewRates && <><th className="py-3 text-right font-medium">Daily wage</th><th className="py-3 text-right font-medium">Total daily cost</th></>}</tr></thead>
      <tbody className="divide-y divide-slate-100">{[...groups].map(([role, group]) => {
        const complete = group.dailyRates.length === group.count;
        const minimum = Math.min(...group.dailyRates);
        const maximum = Math.max(...group.dailyRates);
        return <tr key={role}><td className="py-4 font-medium">{role}</td><td className="py-4 text-right tabular-nums">{group.count}</td>{canViewRates && <><td className="py-4 text-right tabular-nums">{complete ? minimum === maximum ? money.format(minimum) : `${money.format(minimum)} – ${money.format(maximum)}` : "Not configured"}</td><td className="py-4 text-right font-medium tabular-nums">{complete ? money.format(group.dailyRates.reduce((sum, rate) => sum + rate, 0)) : "Not configured"}</td></>}</tr>;
      })}</tbody>
    </table></div>}
    {canViewRates && <p className="mt-4 text-xs text-slate-500">Current daily rates for active workers. Actual labour cost comes from posted attendance; hourly rates are not converted to daily wages.</p>}
  </section>;
}
