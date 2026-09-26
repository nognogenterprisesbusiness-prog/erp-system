"use client";
import { Button } from "@/components/ui/button";

export default function WorkspaceError({ error, retry }: { error: Error & { digest?: string }; retry: () => void }) {
  return <section className="rounded-2xl border border-red-200 bg-white px-6 py-16 text-center"><h1 className="text-xl font-semibold text-slate-900">The workspace could not be loaded</h1><p className="mx-auto mt-2 max-w-md text-sm text-slate-500">Check your connection and try again. If the problem continues, contact an administrator.</p>{error.digest && <p className="mt-3 break-all text-xs text-slate-500">Error reference: {error.digest}</p>}<Button className="mt-6" onClick={retry}>Try again</Button></section>;
}
