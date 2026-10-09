"use client";

import { Button } from "@/components/ui/button";

export default function ManualError({ reset }: { reset: () => void }) {
  return <main id="manual-content" className="px-6 py-12"><h1 className="text-2xl font-semibold text-slate-900">The guide could not load</h1><p role="alert" className="mt-3 leading-7 text-slate-600">Check your connection and try opening the guide again.</p><Button type="button" variant="outline" className="mt-5" onClick={reset}>Try again</Button></main>;
}
