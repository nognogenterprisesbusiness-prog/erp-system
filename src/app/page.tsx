import Image from "next/image";

import { LoginForm } from "@/components/auth/login-form";
import { ThemeToggle } from "@/components/layout/theme-toggle";

export default function LoginPage() {
  return (
    <main className="flex min-h-svh items-center justify-center bg-[#f5f6f8] px-5 py-10">
      <div className="absolute right-5 top-5"><ThemeToggle /></div>
      <section className="w-full max-w-[400px]" aria-labelledby="login-title">
        <div className="mb-10 flex items-center justify-center gap-3">
          <Image src="/logo-nognog.webp" alt="Nognog" width={48} height={48} priority />
          <p className="text-sm font-bold tracking-[0.12em] text-[#061228]">NOGNOG</p>
        </div>

        <div className="mb-8 text-center">
          <h1 id="login-title" className="text-3xl font-semibold tracking-[-0.035em] text-[#07152d]">Welcome back</h1>
          <p className="mt-2 text-sm leading-6 text-slate-500">Sign in to access your construction workspace.</p>
        </div>

        <LoginForm />


        <p className="mt-8 text-center text-xs text-slate-400">Authorized Nognog personnel only.</p>
      </section>
    </main>
  );
}
