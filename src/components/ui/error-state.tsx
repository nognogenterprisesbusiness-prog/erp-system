import Image from "next/image";
import { IntentLink as Link } from "@/components/layout/intent-link";

import { Button } from "@/components/ui/button";

export function ErrorState({ code, onRetry }: { code: 404 | 500; onRetry?: () => void }) {
  const missing = code === 404;

  return <main className="flex min-h-svh items-center justify-center bg-[#f5f7fa] px-5 py-10 text-[#07152d]">
    <section className="mx-auto w-full max-w-lg text-center" aria-labelledby="error-title">
      <p className="text-xs font-semibold uppercase tracking-[0.2em] text-cyan-700">Nognog Enterprises</p>
      <Image src={missing ? "/error-404.webp" : "/error-500.webp"} alt={missing ? "Illustration of a missing page" : "Illustration of a server repair"} width={480} height={360} priority className="mx-auto mt-4 h-auto w-full max-w-[400px]" />
      <p className="text-xs font-semibold uppercase tracking-[0.18em] text-cyan-700">Error {code}</p>
      <h1 id="error-title" className="mt-2 text-2xl font-semibold tracking-tight sm:text-3xl">{missing ? "Page not found" : "Something went wrong"}</h1>
      <p className="mx-auto mt-3 max-w-sm text-sm leading-6 text-slate-500">{missing ? "This page may have moved or the address may be incorrect." : "We couldn’t load this page. Try again, or contact your administrator if the problem continues."}</p>
      <div className="mt-6 flex flex-wrap items-center justify-center gap-2">
        {onRetry ? <Button type="button" onClick={onRetry}>Try again</Button> : null}
        <Button variant={onRetry ? "outline" : "default"} asChild><Link href="/">Back to home</Link></Button>
      </div>
    </section>
  </main>;
}
