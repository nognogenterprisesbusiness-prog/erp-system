import Image from "next/image";
import { notFound } from "next/navigation";

export default function StagingSetupPage() {
  if (process.env.APP_MODE !== "local-demo") notFound();
  return <main className="flex min-h-svh items-center justify-center bg-slate-50 px-6 py-12">
    <section className="w-full max-w-lg rounded-2xl border border-slate-200 bg-white p-8 shadow-sm">
      <Image src="/logo-nognog.webp" alt="Nognog Enterprises" width={48} height={48} />
      <h1 className="mt-6 text-2xl font-semibold text-slate-900">Staging setup required</h1>
      <p className="mt-3 text-sm leading-6 text-slate-600">The browser-only demo has been retired. To preview the connected ERP, configure an isolated Supabase staging project and set APP_MODE and NEXT_PUBLIC_APP_MODE to staging.</p>
      <p className="mt-3 text-sm leading-6 text-slate-600">Apply the migrations and staging seed, create separate test accounts, then sign in. Production data and authentication remain separate.</p>
    </section>
  </main>;
}
