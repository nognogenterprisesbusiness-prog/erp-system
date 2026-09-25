import { TrendingUpIcon } from "@hugeicons/core-free-icons";
import { HugeiconsIcon, type IconSvgElement } from "@hugeicons/react";

export function MetricCard({ label, value, icon, tone, detail, trend, trendLabel }: {
  label: string;
  value: number | string;
  icon: IconSvgElement;
  tone: string;
  detail?: string;
  trend?: string;
  trendLabel?: string;
}) {
  return <article className="flex min-h-28 flex-col justify-between rounded-2xl border border-slate-200 bg-white p-4 shadow-[0_1px_2px_rgba(15,23,42,0.03)] sm:min-h-32 sm:p-5">
    <div className="flex items-start justify-between gap-3">
      <div className="min-w-0">
        <p className="text-sm font-medium text-slate-500">{label}</p>
        <div className="mt-2 flex flex-wrap items-baseline gap-x-2 gap-y-1">
          <p className="text-2xl font-semibold tracking-[-0.04em] text-[#07152d] tabular-nums sm:text-3xl">{typeof value === "number" ? value.toLocaleString() : value}</p>
          {trend ? <span className="inline-flex items-center gap-0.5 text-xs font-semibold text-emerald-700" aria-label={trendLabel ?? trend}><HugeiconsIcon icon={TrendingUpIcon} size={15} />{trend}</span> : null}
        </div>
      </div>
      <span className={`grid size-10 shrink-0 place-items-center rounded-xl sm:size-12 ${tone}`} aria-hidden="true"><HugeiconsIcon icon={icon} size={20} strokeWidth={1.4} /></span>
    </div>
    {detail ? <p className="mt-3 text-xs text-slate-500">{detail}</p> : null}
  </article>;
}
