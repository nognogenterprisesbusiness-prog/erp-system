import { notFound } from "next/navigation";
import { AnnotatedScreenshot } from "@/components/help/annotated-screenshot";
import { ManualOutline } from "@/components/help/manual-outline";
import { IntentLink as Link } from "@/components/layout/intent-link";
import { Button } from "@/components/ui/button";
import { requireUser } from "@/lib/auth";
import { getManualGuides, roleResponsibilities } from "@/lib/help/manual";
import { toManualTopics } from "@/lib/help/navigation";
import { getGuideFigures } from "@/lib/help/screenshots";
import { roleLabels } from "@/lib/users/access";

export default async function ManualTopicPage({ params }: { params: Promise<{ topic: string }> }) {
  const [user, { topic }] = await Promise.all([requireUser(), params]);
  const guides = getManualGuides(user.roles);
  const guide = guides.find((entry) => entry.id === topic);
  if (!guide) notFound();
  const topics = toManualTopics(guides);
  const position = topics.findIndex((entry) => entry.id === topic);
  const current = topics[position];
  const previous = topics[position - 1];
  const next = topics[position + 1];
  const figures = getGuideFigures(guide);
  const sections = [
    { id: "before", title: "Before you start" },
    ...guide.steps.map((step, index) => ({ id: `step-${index + 1}`, title: step.title })),
    ...(figures.length ? [{ id: "screenshots", title: "Screenshots and field guide" }] : []),
    { id: "result", title: "What should happen" }, { id: "tips", title: "Tips and common problems" },
  ];
  return <main id="manual-content" tabIndex={-1} className="min-w-0 px-5 py-8 outline-none sm:px-8 lg:px-10 lg:py-10 xl:grid xl:grid-cols-[minmax(0,800px)_200px] xl:items-start xl:justify-center xl:gap-10">
    <ManualOutline key={topic} sections={sections} />
    <article className="min-w-0 xl:col-start-1 xl:row-start-1" aria-labelledby="guide-title">
      <nav aria-label="Breadcrumb" className="mb-6 text-sm text-slate-500"><ol className="flex flex-wrap items-center gap-2"><li>{current.group}</li><li aria-hidden="true">›</li><li className="text-cyan-800" aria-current="page">{current.title}</li></ol></nav>
      <h1 id="guide-title" className="border-b border-slate-200 pb-5 text-2xl font-semibold tracking-tight text-slate-900 sm:text-3xl">{guide.title}</h1>
      <p className="mt-5 text-base leading-8 text-slate-600">{guide.description}</p>
      {topic === "start" && <div className="mt-6 rounded-lg border border-slate-200 bg-slate-50 px-5 py-4"><p className="text-sm font-semibold text-slate-900">Your work</p>{user.roles.map((role) => <p key={role} className="mt-2 text-sm leading-6 text-slate-600"><strong className="font-semibold text-slate-800">{roleLabels[role]}: </strong>{roleResponsibilities[role].summary}</p>)}<p className="mt-3 text-sm leading-6 text-slate-500">Choose a topic on the left, or use Browse the user manual on a phone. Search includes the instructions inside each guide.</p></div>}
      <section id="before" className="mt-9 scroll-mt-24"><h2 className="border-b border-slate-200 pb-3 text-lg font-semibold text-slate-900">Before you start</h2><p className="mt-4 text-base leading-8 text-slate-600">{guide.before}</p></section>
      <ol className="mt-10 space-y-10">{guide.steps.map((step, index) => <li key={step.title} id={`step-${index + 1}`} className="scroll-mt-24"><h2 className="flex items-start gap-3 border-b border-slate-200 pb-3 text-lg font-semibold text-slate-900"><span aria-hidden="true" className="mt-0.5 flex size-6 shrink-0 items-center justify-center rounded-full bg-slate-100 text-sm text-slate-600">{index + 1}</span><span><span className="sr-only">Step {index + 1}: </span>{step.title}</span></h2><p className="mt-4 text-base leading-8 text-slate-600">{step.detail}</p></li>)}</ol>
      {figures.length > 0 && <section id="screenshots" className="mt-10 scroll-mt-24"><h2 className="border-b border-slate-200 pb-3 text-lg font-semibold text-slate-900">Screenshots and field guide</h2><p className="mt-4 text-base leading-8 text-slate-600">Follow the numbered boxes below. Select Enlarge to inspect a screenshot at full size.</p>{figures.map((figure) => <AnnotatedScreenshot key={figure.src} figure={figure} />)}</section>}
      <section id="result" className="mt-10 scroll-mt-24 rounded-lg border border-slate-200 bg-slate-50 p-5"><h2 className="text-lg font-semibold text-slate-900">What should happen</h2><p className="mt-3 text-base leading-8 text-slate-600">{guide.result}</p></section>
      <section id="tips" className="mt-10 scroll-mt-24"><h2 className="border-b border-slate-200 pb-3 text-lg font-semibold text-slate-900">Tips and common problems</h2><ul className="mt-4 list-disc space-y-3 pl-5 text-base leading-8 text-slate-600">{guide.tips.map((tip) => <li key={tip}>{tip}</li>)}</ul></section>
      <Button asChild variant="outline" className="mt-7 h-auto min-h-11 max-w-full whitespace-normal text-center"><Link href={guide.href}>Open this work area →</Link></Button>
      <nav aria-label="Previous and next guides" className="mt-12 grid grid-cols-2 gap-4 border-t border-slate-200 pt-6">
        {previous ? <Link href={`/manual/${previous.id}`} className="rounded-lg p-3 text-sm leading-6 text-slate-700 hover:bg-slate-50 focus-visible:ring-2 focus-visible:ring-cyan-600"><span className="block text-xs text-slate-500">← Previous</span>{previous.title}</Link> : <span />}
        {next && <Link href={`/manual/${next.id}`} className="rounded-lg p-3 text-right text-sm leading-6 text-slate-700 hover:bg-slate-50 focus-visible:ring-2 focus-visible:ring-cyan-600"><span className="block text-xs text-slate-500">Next →</span>{next.title}</Link>}
      </nav>
      <p className="mt-8 text-sm leading-6 text-slate-500">Available actions depend on your role, active assignments and the record&apos;s current status.</p>
    </article>
  </main>;
}
