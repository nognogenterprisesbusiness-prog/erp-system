import { HistoryLink } from "@/components/layout/history-link";
import { demoGuides } from "@/lib/demo/search";
import { demoRoleViews } from "@/lib/demo/navigation";
import type { DemoRole } from "@/lib/demo/schema";

export function DemoHelp({ topic, role }: { topic?: string | null; role: DemoRole }) {
  const guides = demoGuides.filter((guide) => demoRoleViews[role].includes(guide.requires));
  return <div className="mx-auto max-w-3xl space-y-4">
    <nav aria-label="Guide topics" className="flex flex-wrap gap-2">{guides.map((guide) => <a key={guide.id} href={`#${guide.id}`} className={`rounded-full border px-3 py-1.5 text-xs font-medium ${topic === guide.id ? "border-cyan-700 bg-cyan-700 text-white" : "border-slate-200 bg-white text-slate-600 hover:border-cyan-400"}`}>{guide.title}</a>)}</nav>
    {guides.map((guide) => <section key={guide.id} id={guide.id} className={`scroll-mt-32 rounded-2xl border bg-white p-5 sm:p-6 ${topic === guide.id ? "border-cyan-300" : "border-slate-200"}`}>
      <div className="flex flex-wrap items-start justify-between gap-3"><div><h2 className="text-base font-semibold text-slate-800">{guide.title}</h2><p className="mt-1 text-sm text-slate-500">{guide.detail}.</p></div><HistoryLink href={guide.href} className="rounded-full border border-slate-200 px-3 py-1.5 text-xs font-semibold text-cyan-700 hover:border-cyan-400">Open section →</HistoryLink></div>
      <ol className="mt-4 space-y-2 pl-5 text-sm leading-6 text-slate-600 [list-style-type:decimal]">{guide.steps.map((step) => <li key={step}>{step}</li>)}</ol>
    </section>)}
  </div>;
}
