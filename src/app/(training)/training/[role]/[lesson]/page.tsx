import type { Metadata } from "next";
import Image from "next/image";
import Link from "next/link";
import { notFound } from "next/navigation";
import { LessonDoneButton } from "@/components/training/training-progress";
import { drivePreviewUrl, formatVideoTime, getRoleLessons, getTrainingRole, trainingRoles } from "@/lib/training/courses";

type Params = Promise<{ role: string; lesson: string }>;

export const dynamicParams = false;
export function generateStaticParams() {
  return trainingRoles.flatMap((role) => role.lessons.map((lesson) => ({ role: role.id, lesson })));
}

async function load(params: Params) {
  const { role: roleId, lesson: slug } = await params;
  const role = getTrainingRole(roleId);
  const lessons = role ? getRoleLessons(role) : [];
  const index = lessons.findIndex((item) => item.slug === slug);
  return role && index >= 0 ? { role, lessons, index, lesson: lessons[index] } : null;
}

export async function generateMetadata({ params }: { params: Params }): Promise<Metadata> {
  const data = await load(params);
  return { title: data ? `${data.lesson.title} · ${data.role.label} training | Nognog Operations` : "Staff training | Nognog Operations" };
}

export default async function LessonPage({ params }: { params: Params }) {
  const data = await load(params);
  if (!data) notFound();
  const { role, lessons, index, lesson } = data;
  const previous = lessons[index - 1];
  const next = lessons[index + 1];
  const lessonHref = (slug: string) => `/training/${role.id}/${slug}`;
  return <>
    <nav aria-label="Breadcrumb" className="text-sm text-slate-500"><Link href="/training" className="hover:text-cyan-700">Training</Link> <span aria-hidden>/</span> <Link href={`/training/${role.id}`} className="hover:text-cyan-700">{role.label}</Link> <span aria-hidden>/</span> <span className="text-slate-700">Lesson {index + 1}</span></nav>

    <div className="mt-4 grid gap-8 lg:grid-cols-[1fr_280px]">
      <article className="min-w-0">
        <p className="text-xs font-semibold uppercase tracking-[0.14em] text-cyan-700">Lesson {index + 1} of {lessons.length} · {lesson.kind === "mobile" ? "Phone app" : "Web"} · {lesson.minutes} min</p>
        <h1 className="mt-2 text-3xl font-semibold tracking-[-0.03em] text-slate-900">{lesson.title}</h1>
        <p className="mt-3 max-w-3xl text-sm leading-6 text-slate-600">{lesson.summary}</p>

        <div className="mt-6 aspect-video overflow-hidden rounded-2xl bg-slate-900 shadow-sm">
          <iframe src={drivePreviewUrl(lesson.driveId)} title={`Video: ${lesson.title}`} allow="autoplay; fullscreen" allowFullScreen className="size-full border-0" />
        </div>
        <p className="mt-2 text-xs text-slate-500">Press play. Use the full-screen button for a bigger picture. Subtitles are shown in the video.</p>

        <section aria-labelledby="steps-title" className="mt-10">
          <h2 id="steps-title" className="text-xl font-semibold text-slate-900">Step by step</h2>
          <p className="mt-1 text-sm text-slate-500">The same steps as the video, to read at your own pace. The time shows where each step starts in the video.</p>
          <ol className="mt-5 space-y-5">
            {lesson.steps.map((step, stepIndex) => <li key={step.image} className="grid gap-4 rounded-2xl border border-slate-200 bg-white p-4 md:grid-cols-[minmax(0,1.1fr)_minmax(0,1fr)] md:p-5">
              <a href={step.image} target="_blank" rel="noreferrer" className="relative block aspect-video overflow-hidden rounded-xl bg-slate-100 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-cyan-600" aria-label={`Open the picture for step ${stepIndex + 1} in full size`}>
                <Image src={step.image} alt={`Screen for: ${step.title}`} fill sizes="(min-width: 1024px) 420px, (min-width: 768px) 50vw, 100vw" className="object-cover" />
              </a>
              <div className="min-w-0">
                <p className="flex items-center gap-2 text-xs font-semibold text-cyan-700"><span className="grid size-6 place-items-center rounded-full bg-cyan-50">{stepIndex + 1}</span>At {formatVideoTime(step.time)} in the video</p>
                <h3 className="mt-2 text-lg font-semibold text-slate-900">{step.title}</h3>
                <p className="mt-2 text-sm leading-6 text-slate-700">{step.text}</p>
              </div>
            </li>)}
          </ol>
        </section>

        {lesson.remember && <section aria-labelledby="remember-title" className="mt-8 rounded-2xl border border-amber-200 bg-amber-50 p-5">
          <h2 id="remember-title" className="text-base font-semibold text-amber-900">Remember</h2>
          <p className="mt-2 text-sm leading-6 text-amber-900">{lesson.remember}</p>
        </section>}

        <div className="mt-8 flex flex-col gap-3 border-t border-slate-200 pt-6 sm:flex-row sm:items-center sm:justify-between">
          <LessonDoneButton lessonKey={`${role.id}/${lesson.slug}`} />
          <div className="flex gap-2">
            {previous && <Link href={lessonHref(previous.slug)} className="inline-flex min-h-10 items-center rounded-full border border-slate-200 bg-white px-4 text-sm font-medium text-slate-700 hover:bg-slate-50">← Previous</Link>}
            {next ? <Link href={lessonHref(next.slug)} className="inline-flex min-h-10 items-center rounded-full bg-[#07152d] px-4 text-sm font-semibold text-white hover:bg-[#0d2347]">Next lesson →</Link>
              : <Link href={`/training/${role.id}`} className="inline-flex min-h-10 items-center rounded-full bg-[#07152d] px-4 text-sm font-semibold text-white hover:bg-[#0d2347]">Back to the course</Link>}
          </div>
        </div>
      </article>

      <aside aria-label="Lessons in this course" className="lg:sticky lg:top-24 lg:self-start">
        <p className="text-xs font-semibold uppercase tracking-[0.12em] text-slate-500">{role.label} course</p>
        <ol className="mt-3 space-y-1">
          {lessons.map((item, itemIndex) => <li key={item.slug}>
            <Link href={lessonHref(item.slug)} aria-current={item.slug === lesson.slug ? "page" : undefined} className={`flex gap-3 rounded-xl px-3 py-2.5 text-sm ${item.slug === lesson.slug ? "bg-white font-semibold text-slate-900 shadow-sm ring-1 ring-slate-200" : "text-slate-600 hover:bg-white"}`}>
              <span className="w-5 shrink-0 text-slate-400">{itemIndex + 1}</span><span>{item.title}<span className="block text-xs font-normal text-slate-500">{item.kind === "mobile" ? "Phone app" : "Web"} · {item.minutes} min</span></span>
            </Link>
          </li>)}
        </ol>
      </aside>
    </div>
  </>;
}
