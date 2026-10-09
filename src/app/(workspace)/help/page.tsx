import Image from "next/image";
import { ManualTopics } from "@/components/help/manual-topics";
import { IntentLink as Link } from "@/components/layout/intent-link";
import { Button } from "@/components/ui/button";
import { ListFilterBar } from "@/components/ui/list-filter-bar";
import { PageHeader } from "@/components/ui/page-header";
import { SearchField } from "@/components/ui/search-field";
import { requireUser } from "@/lib/auth";
import { getManualGuides, roleResponsibilities, type ManualFigure } from "@/lib/help/manual";
import { roleLabels } from "@/lib/users/access";

function AnnotatedScreenshot({ figure, id }: { figure: ManualFigure; id: string }) {
  return <figure className="mt-5" aria-labelledby={`${id}-caption`}>
    <div className="relative isolate overflow-hidden rounded-xl border border-slate-200 bg-white" style={{ maxWidth: figure.width }}>
      <Image src={figure.src} width={figure.width} height={figure.height} alt={figure.alt} sizes="(max-width: 768px) 90vw, 800px" className="h-auto w-full" />
      {figure.marks.map((mark, index) => <span key={mark.label} aria-hidden="true" className="pointer-events-none absolute rounded border-2 border-cyan-700 bg-cyan-500/5" style={{ left: `${mark.x}%`, top: `${mark.y}%`, width: `${mark.width}%`, height: `${mark.height}%` }}>
        <span className="absolute -left-1 -top-1 flex size-6 items-center justify-center rounded-full bg-cyan-800 text-sm font-bold text-white ring-2 ring-white">{index + 1}</span>
      </span>)}
    </div>
    <figcaption id={`${id}-caption`} className="mt-3 text-sm leading-6 text-slate-600">
      <p className="font-medium text-slate-800">Example screen: an empty form. Your available choices depend on your access.</p>
      <ol className="mt-2 list-decimal space-y-1 pl-5">{figure.marks.map((mark) => <li key={mark.label}>{mark.label}</li>)}</ol>
    </figcaption>
  </figure>;
}

export default async function HelpPage({ searchParams }: { searchParams: Promise<{ q?: string | string[] }> }) {
  const [user, params] = await Promise.all([requireUser(), searchParams]);
  const query = (typeof params.q === "string" ? params.q : "").trim().slice(0, 100);
  const guides = getManualGuides(user.roles, query);
  return <div className="mx-auto max-w-4xl">
    <PageHeader title="User manual" description="Step-by-step guides for your role, from setup and requests to delivery, actual use and payments." />
    <section aria-labelledby="your-role" className="mt-7 rounded-2xl border border-slate-200 bg-white p-5 sm:p-6">
      <h2 id="your-role" className="text-base font-semibold text-slate-900">Your work and access</h2>
      <div className="mt-3 space-y-4">{user.roles.map((role) => <div key={role}>
        <h3 className="text-sm font-semibold text-cyan-800">{roleLabels[role]}</h3>
        <p className="mt-1 text-sm leading-6 text-slate-600">{roleResponsibilities[role].summary}</p>
        <ul className="mt-2 list-disc space-y-1 pl-5 text-sm leading-6 text-slate-600">{roleResponsibilities[role].tasks.map((task) => <li key={task}>{task}</li>)}</ul>
        <p className="mt-2 text-sm leading-6 text-slate-600">{roleResponsibilities[role].boundary}</p>
      </div>)}</div>
      <details className="mt-4 border-t border-slate-100 pt-4">
        <summary className="cursor-pointer text-sm font-semibold text-slate-700 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-cyan-600">Who does what? All five roles</summary>
        <dl className="mt-3 space-y-3 text-sm leading-6">{Object.entries(roleResponsibilities).map(([role, responsibility]) => <div key={role}><dt className="font-semibold text-slate-900">{roleLabels[role as keyof typeof roleLabels]}</dt><dd className="text-slate-600">{responsibility.summary} {responsibility.boundary}</dd></div>)}</dl>
      </details>
    </section>
    <ListFilterBar role="search" aria-label="Search the user manual">
      <SearchField key={query} name="q" defaultValue={query} label="Search the manual" placeholder="Search: receipt, approval, stock…" maxLength={100} />
      <Button type="submit" variant="outline">Search</Button>
      {query && <Button asChild variant="ghost"><Link href="/help">Clear search</Link></Button>}
    </ListFilterBar>
    <ManualTopics topics={guides.map(({ id, title }) => ({ id, title }))} />
    {guides.length === 0 ? <div className="mt-5 rounded-2xl border border-slate-200 bg-white p-6"><h2 className="text-base font-semibold">No matching guides</h2><p className="mt-2 text-sm text-slate-600">Try a shorter search such as stock, receipt or request. Guides are limited to the workflows available to your role.</p></div> : <div className="mt-5 space-y-4">{guides.map((guide) => <details key={`${query}:${guide.id}`} id={guide.id} open={Boolean(query) || guide.id === "start"} className="group scroll-mt-28 rounded-2xl border border-slate-200 bg-white p-5 target:ring-2 target:ring-cyan-600 sm:p-6">
      <summary className="cursor-pointer rounded text-slate-900 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-cyan-600"><span className="ml-1 text-base font-semibold">{guide.title}</span><span className="mt-1 block pl-5 text-sm font-normal leading-6 text-slate-500">{guide.description}</span></summary>
      <div className="mt-4 border-t border-slate-100 pt-4">
        <p className="text-sm leading-6 text-slate-600"><strong className="font-semibold text-slate-800">Before you start: </strong>{guide.before}</p>
        <ol className="mt-4 list-decimal space-y-4 pl-5 text-sm leading-6 text-slate-600">{guide.steps.map((step) => <li key={step.title}><h3 className="font-semibold text-slate-900">{step.title}</h3><p>{step.detail}</p></li>)}</ol>
        {guide.figure && <AnnotatedScreenshot figure={guide.figure} id={guide.id} />}
        <div className="mt-5 rounded-xl bg-slate-50 p-4"><h3 className="text-sm font-semibold text-slate-900">What should happen</h3><p className="mt-1 text-sm leading-6 text-slate-600">{guide.result}</p></div>
        <ul className="mt-4 list-disc space-y-2 pl-5 text-sm leading-6 text-slate-600">{guide.tips.map((tip) => <li key={tip}>{tip}</li>)}</ul>
        <Button asChild variant="outline" className="mt-5 max-w-full whitespace-normal text-center"><Link href={guide.href}>Open section →</Link></Button>
      </div>
    </details>)}</div>}
    <p className="mt-6 text-sm leading-6 text-slate-500">This guide describes the supported workflow. Your role, active assignments and the status of the record determine which actions are available.</p>
  </div>;
}
