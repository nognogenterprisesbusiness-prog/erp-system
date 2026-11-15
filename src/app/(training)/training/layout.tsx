import type { Metadata } from "next";
import Image from "next/image";
import Link from "next/link";

export const metadata: Metadata = { title: "Staff training | Nognog Operations", description: "Video lessons for every Nognog role, on the web and the phone app." };

/** Public training area: no sign-in required, separate from the signed-in Help centre (/manual). */
export default function TrainingLayout({ children }: { children: React.ReactNode }) {
  return <div className="min-h-svh bg-[#f5f6f8]">
    <a href="#training-content" className="sr-only z-50 rounded bg-white p-3 text-cyan-800 focus:fixed focus:left-4 focus:top-4 focus:not-sr-only">Skip to lessons</a>
    <header className="sticky top-0 z-30 border-b border-slate-200 bg-white/95 backdrop-blur">
      <div className="mx-auto flex h-16 max-w-6xl items-center justify-between gap-3 px-4 sm:px-6">
        <Link href="/training" className="flex min-w-0 items-center gap-3 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-cyan-600">
          <Image src="/logo-nognog.webp" alt="" width={34} height={34} />
          <span className="truncate text-base font-semibold text-slate-900"><span className="hidden sm:inline">Nognog · </span>Staff training</span>
        </Link>
        <Link href="/" className="inline-flex min-h-10 shrink-0 items-center rounded-full border border-slate-200 px-4 text-sm font-medium text-slate-700 hover:bg-slate-50 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-cyan-600">Open Nognog</Link>
      </div>
    </header>
    <main id="training-content" className="mx-auto max-w-6xl px-4 pb-16 pt-8 sm:px-6">{children}</main>
    <footer className="border-t border-slate-200 bg-white py-6 text-center text-xs text-slate-500">The videos use made-up demo data. Questions? Ask your Admin.</footer>
  </div>;
}
