import type { Metadata } from "next";
import { Suspense } from "react";
import { ManualNavigation } from "@/components/help/manual-navigation";
import { IntentLink as Link } from "@/components/layout/intent-link";
import { requireUser } from "@/lib/auth";
import { getManualGuides } from "@/lib/help/manual";
import { toManualTopics } from "@/lib/help/navigation";
import { roleLabels } from "@/lib/users/access";

export const metadata: Metadata = { title: "User manual | Nognog Operations" };

export default async function ManualLayout({ children }: { children: React.ReactNode }) {
  const user = await requireUser();
  const topics = toManualTopics(getManualGuides(user.roles));
  return <div className="min-h-screen bg-white">
    <a href="#manual-content" className="sr-only z-50 rounded bg-white p-3 text-cyan-800 focus:fixed focus:left-4 focus:top-4 focus:not-sr-only">Skip to guide</a>
    <header className="sticky top-0 z-30 h-16 border-b border-slate-200 bg-white">
      <div className="mx-auto flex h-full max-w-[1600px] items-center justify-between gap-3 px-5 sm:px-8">
        <Link href="/manual/start" className="min-w-0 text-base font-semibold text-slate-900 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-cyan-600"><span className="hidden sm:inline">Nognog · </span>User manual</Link>
        <div className="flex items-center gap-5"><span className="hidden text-sm text-slate-500 md:inline">{user.roles.map((role) => roleLabels[role]).join(" / ")}</span><Link href="/dashboard" className="inline-flex min-h-11 items-center rounded-full border border-slate-200 px-4 text-sm font-medium text-slate-700 hover:bg-slate-50 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-cyan-600">← Back to ERP</Link></div>
      </div>
    </header>
    <div className="mx-auto max-w-[1600px] lg:flex">
      <Suspense fallback={<aside className="hidden w-64 shrink-0 border-r border-slate-200 lg:block xl:w-72" aria-label="Loading manual navigation" />}><ManualNavigation topics={topics} /></Suspense>
      <div className="min-w-0 flex-1">
        <Suspense fallback={null}><ManualNavigation topics={topics} mobile /></Suspense>
        {children}
      </div>
    </div>
  </div>;
}
