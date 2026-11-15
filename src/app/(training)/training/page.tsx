import Link from "next/link";
import { ArrowRight01Icon, Building03Icon, ConstructionIcon, BlueprintIcon, Money03Icon, PlayCircleIcon, TruckIcon, UserGroupIcon, WarehouseIcon } from "@hugeicons/core-free-icons";
import { HugeiconsIcon } from "@hugeicons/react";
import { getRoleLessons, trainingCompleteCourseDriveId, trainingDriveFolder, trainingRoles, drivePreviewUrl, type TrainingRoleId } from "@/lib/training/courses";

const roleIcons: Record<TrainingRoleId, typeof Building03Icon> = {
  admin: Building03Icon, hr: UserGroupIcon, engineer: BlueprintIcon, foreman: ConstructionIcon, warehouse: WarehouseIcon, finance: Money03Icon, driver: TruckIcon,
};

export default function TrainingHomePage() {
  return <>
    <section className="rounded-2xl bg-[#07152d] px-6 py-10 text-white sm:px-10">
      <p className="text-xs font-semibold uppercase tracking-[0.14em] text-cyan-300">Staff training</p>
      <h1 className="mt-3 max-w-2xl text-3xl font-semibold tracking-[-0.03em] sm:text-4xl">Learn Nognog for your job, one short video at a time.</h1>
      <p className="mt-4 max-w-2xl text-sm leading-6 text-slate-300">Each lesson has a video with voice and subtitles, the steps with pictures, and a short reminder. No sign-in needed. Watch on your computer or your phone.</p>
    </section>

    <section aria-labelledby="who-title" className="mt-10">
      <h2 id="who-title" className="text-2xl font-semibold tracking-[-0.02em] text-slate-900">Who are you?</h2>
      <p className="mt-1 text-sm text-slate-500">Choose your job to see your lessons.</p>
      <ul className="mt-5 grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
        {trainingRoles.map((role) => {
          const lessons = getRoleLessons(role);
          const minutes = lessons.reduce((sum, lesson) => sum + lesson.minutes, 0);
          return <li key={role.id}>
            <Link href={`/training/${role.id}`} className="group flex h-full flex-col rounded-2xl border border-slate-200 bg-white p-5 transition-colors hover:border-cyan-600 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-cyan-600">
              <span className="grid size-11 place-items-center rounded-xl bg-cyan-50 text-cyan-700"><HugeiconsIcon icon={roleIcons[role.id]} size={22} /></span>
              <span className="mt-4 text-lg font-semibold text-slate-900">{role.label}</span>
              <span className="mt-1 flex-1 text-sm leading-6 text-slate-600">{role.who}</span>
              <span className="mt-4 flex items-center justify-between text-xs font-medium text-slate-500">
                <span>{lessons.length} lessons · about {minutes} min · {role.uses}</span>
                <HugeiconsIcon icon={ArrowRight01Icon} size={18} className="text-cyan-700 transition-transform group-hover:translate-x-0.5" />
              </span>
            </Link>
          </li>;
        })}
      </ul>
    </section>

    <section aria-labelledby="all-title" className="mt-12 grid gap-6 rounded-2xl border border-slate-200 bg-white p-5 sm:p-6 lg:grid-cols-[1.4fr_1fr] lg:items-center">
      <div className="aspect-video overflow-hidden rounded-xl bg-slate-900">
        <iframe src={drivePreviewUrl(trainingCompleteCourseDriveId)} title="Nognog complete training course" allow="autoplay; fullscreen" allowFullScreen loading="lazy" className="size-full border-0" />
      </div>
      <div>
        <p className="flex items-center gap-2 text-xs font-semibold uppercase tracking-[0.12em] text-cyan-700"><HugeiconsIcon icon={PlayCircleIcon} size={16} />Everything in one video</p>
        <h2 id="all-title" className="mt-2 text-xl font-semibold text-slate-900">The complete course</h2>
        <p className="mt-2 text-sm leading-6 text-slate-600">All 14 lessons in one video, about 65 minutes. Good for new office staff and for the owner.</p>
        <a href={trainingDriveFolder} target="_blank" rel="noreferrer" className="mt-4 inline-flex min-h-10 items-center rounded-full border border-slate-200 px-4 text-sm font-medium text-slate-700 hover:bg-slate-50">Open all videos in Google Drive</a>
      </div>
    </section>
  </>;
}
