"use client";
import { Button } from "@/components/ui/button";

export default function WorkspaceError({ reset }: { error: Error & { digest?: string }; reset: () => void }) {
  return <section className="rounded-2xl border border-red-200 bg-white px-6 py-16 text-center"><h1 className="text-xl font-semibold text-slate-900">The workspace could not be loaded</h1><p className="mx-auto mt-2 max-w-md text-sm text-slate-500">Check your connection and try again. If the problem continues, contact an administrator.</p><Button className="mt-6" onClick={reset}>Try again</Button></section>;
}
