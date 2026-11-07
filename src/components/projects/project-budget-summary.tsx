import { projectBudgetPosition } from "@nognog/domain";

const money = new Intl.NumberFormat("en-PH", { style: "currency", currency: "PHP" });

/** Approved budget minus posted project costs; a negative balance is shown as Over budget. */
export function ProjectBudgetSummary({ budget, cost }: { budget: number | string; cost: number | string }) {
  const position = projectBudgetPosition(budget, cost);
  const metrics = [
    { label: "Approved budget", amount: position.approvedBudget, over: false },
    { label: "Actual costs", amount: position.actualCosts, over: false },
    { label: position.remainingLabel, amount: position.remaining, over: position.overBudget },
  ];
  return <dl className="grid gap-4 sm:grid-cols-3">
    {metrics.map(({ label, amount, over }) => <div key={label}>
      <dt className={`text-xs ${over ? "font-semibold text-red-700" : "text-slate-600"}`}>{label}</dt>
      <dd className={`mt-1 text-xl font-semibold tabular-nums ${over ? "text-red-700" : "text-slate-900"}`}>{money.format(amount)}</dd>
    </div>)}
  </dl>;
}
