import { PhotoViewer } from "@/components/ui/photo-viewer";
import { IntentLink as Link } from "@/components/layout/intent-link";
import { Building03Icon } from "@hugeicons/core-free-icons";
import { HugeiconsIcon } from "@hugeicons/react";

import { HistoryLink } from "@/components/layout/history-link";

type ProjectSummaryCardProps = {
  href: string;
  navigation?: "app" | "history";
  code: string;
  name: string;
  location: string;
  photo?: string | null;
  status: string;
  statusTone: "active" | "warning" | "neutral";
  progress?: number;
  showProgress?: boolean;
  details: { label: string; value: string }[];
};

const statusStyles = {
  active: "bg-emerald-50 text-emerald-700",
  warning: "bg-amber-50 text-amber-700",
  neutral: "bg-slate-100 text-slate-600",
};

export function ProjectSummaryCard({ href, navigation = "app", code, name, location, photo, status, statusTone, progress, showProgress = false, details }: ProjectSummaryCardProps) {
  const NavigationLink = navigation === "history" ? HistoryLink : Link;
  return <article className="flex h-full min-w-0 flex-col overflow-hidden rounded-2xl border border-slate-200 bg-white shadow-[0_1px_2px_rgba(15,23,42,0.04)]">
    <div className="relative h-44 shrink-0 bg-slate-100 sm:h-48">
       {photo ? <PhotoViewer src={photo} alt={`${name} photo`} sizes="(max-width: 640px) 100vw, (max-width: 1280px) 50vw, 33vw" /> : <NavigationLink href={href} aria-label={`View ${name}`} className="absolute inset-0 grid place-items-center text-slate-400"><HugeiconsIcon icon={Building03Icon} size={40} strokeWidth={1.4} aria-hidden="true" /></NavigationLink>}
      <span className={`pointer-events-none absolute right-3 top-3 rounded-full px-2.5 py-1 text-xs font-semibold shadow-sm ${statusStyles[statusTone]}`}>{status}</span>
    </div>
    <div className="flex flex-1 flex-col p-5">
      <p className="text-xs font-semibold uppercase tracking-[0.08em] text-cyan-700">{code}</p>
      <h2 className="mt-1 text-lg font-semibold leading-snug text-slate-900"><NavigationLink href={href} className="rounded-sm hover:text-cyan-700 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-cyan-600">{name}</NavigationLink></h2>
      <p className="mt-1 min-h-5 text-sm text-slate-500">{location}</p>
      {showProgress && <div className="mt-5">
        <div className="flex items-center justify-between text-sm"><span className="text-slate-500">Progress</span><span className="font-semibold tabular-nums text-slate-800">{progress ?? 0}%</span></div>
        <div role="progressbar" aria-label={`${name} progress${progress === undefined ? " (no update recorded)" : ""}`} aria-valuemin={0} aria-valuemax={100} aria-valuenow={progress ?? 0} className="mt-2 h-2 overflow-hidden rounded-full bg-slate-100"><div className="h-full rounded-full bg-cyan-600" style={{ width: `${Math.max(0, Math.min(100, progress ?? 0))}%` }} /></div>
      </div>}
      <dl className="mt-4 grid grid-cols-2 gap-x-4 gap-y-3">{details.map((detail) => <div key={detail.label} className="min-w-0"><dt className="text-xs text-slate-500">{detail.label}</dt><dd className="mt-1 line-clamp-2 break-words text-sm font-semibold tabular-nums text-slate-800" title={detail.value}>{detail.value}</dd></div>)}</dl>
    </div>
  </article>;
}
