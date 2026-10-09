"use client";

import { useEffect } from "react";
import { useRouter } from "next/navigation";
import { IntentLink as Link } from "@/components/layout/intent-link";
import { legacyManualDestination } from "@/lib/help/navigation";

export function LegacyManualRedirect({ allowedTopics, query }: { allowedTopics: string[]; query: string }) {
  const router = useRouter();
  useEffect(() => { router.replace(legacyManualDestination(window.location.hash, allowedTopics, query)); }, [allowedTopics, query, router]);
  return <main className="mx-auto max-w-xl px-6 py-20"><h1 className="text-2xl font-semibold text-slate-900">The user manual has moved</h1><p role="status" className="mt-3 text-slate-600">Opening the new documentation page…</p><Link href="/manual" className="mt-5 inline-block text-cyan-800 underline underline-offset-4">Open the user manual</Link></main>;
}
