import type { Metadata } from "next";
import Image from "next/image";
import Link from "next/link";
import { notFound } from "next/navigation";
import { CourseProgress, LessonDoneBadge } from "@/components/training/training-progress";
import { getRoleLessons, getTrainingRole, trainingRoles } from "@/lib/training/courses";

export const dynamicParams = false;
export function generateStaticParams() {
  return trainingRoles.map((role) => ({ role: role.id }));
}

export async function generateMetadata({ params }: { params: Promise<{ role: string }> }): Promise<Metadata> {
  const role = getTrainingRole((await params).role);
  return { title: role ? `${role.label} training | Nognog Operations` : "Staff training | Nognog Operations" };
}

export default async function RoleCoursePage({ params }: { params: Promise<{ role: string }> }) {
  const role = getTrainingRole((await params).role);
  if (!role) notFound();
  const lessons = getRoleLessons(role);
  const minutes = lessons.reduce((sum, lesson) => sum + lesson.minutes, 0);
  return <>
    <nav aria-label="Breadcrumb" className="text-sm text-slate-500"><Link href="/training" className="hover:text-cyan-700">Training</Link> <span aria-hidden>/</span> <span className="text-slate-700">{role.label}</span></nav>
    <header className="mt-4 grid gap-6 lg:grid-cols-[1fr_320px] lg:items-end">
      <div>
        <p className="text-xs font-semibold uppercase tracking-[0.14em] text-cyan-700">Course for</p>
        <h1 className="mt-2 text-3xl font-semibold tracking-[-0.03em] text-slate-900">{role.label}</h1>
        <p className="mt-2 max-w-2xl text-sm leading-6 text-slate-600">{role.who} Watch the lessons in order. {lessons.length} lessons, about {minutes} minutes in total.</p>
        <Link href={`/training/${role.id}/${lessons[0].slug}`} className="mt-5 inline-flex min-h-11 items-center rounded-full bg-[#07152d] px-5 text-sm font-semibold text-white hover:bg-[#0d2347] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-cyan-600">Start the course</Link>
      </div>
      <div className="rounded-2xl border border-slate-200 bg-white p-4"><CourseProgress lessonKeys={lessons.map((lesson) => `${role.id}/${lesson.slug}`)} /></div>
    </header>

    <ol className="mt-8 space-y-4">
      {lessons.map((lesson, index) => <li key={lesson.slug}>
        <Link href={`/training/${role.id}/${lesson.slug}`} className="group grid gap-4 rounded-2xl border border-slate-200 bg-white p-4 transition-colors hover:border-cyan-600 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-cyan-600 sm:grid-cols-[220px_1fr] sm:p-5">
          <span className="relative block aspect-video overflow-hidden rounded-xl bg-slate-100">
            <Image src={lesson.steps[0].image} alt="" fill sizes="(min-width: 640px) 220px, 100vw" className="object-cover" />
            <span className="absolute left-2 top-2 rounded-full bg-[#07152d]/85 px-2.5 py-1 text-xs font-semibold text-white">Lesson {index + 1}</span>
          </span>
          <span className="min-w-0">
            <span className="flex flex-wrap items-center gap-2">
              <span className="rounded-full bg-slate-100 px-2.5 py-1 text-xs font-medium text-slate-600">{lesson.kind === "mobile" ? "Phone app" : "Web"} · {lesson.minutes} min</span>
              <LessonDoneBadge lessonKey={`${role.id}/${lesson.slug}`} />
            </span>
            <span className="mt-2 block text-lg font-semibold text-slate-900 group-hover:text-cyan-800">{lesson.title}</span>
            <span className="mt-1 block text-sm leading-6 text-slate-600">{lesson.summary}</span>
            <span className="mt-2 block text-xs text-slate-500">{lesson.steps.length} steps: {lesson.steps.slice(0, 4).map((step) => step.title).join(" · ")}{lesson.steps.length > 4 ? " …" : ""}</span>
          </span>
        </Link>
      </li>)}
    </ol>
  </>;
}
