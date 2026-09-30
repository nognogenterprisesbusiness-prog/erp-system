import Link from "next/link";

import { RequestPasswordResetForm } from "@/components/auth/password-forms";

export default function ForgotPasswordPage() {
  return <main className="grid min-h-svh place-items-center bg-[#f5f6f8] px-5 py-10"><section className="w-full max-w-sm rounded-xl border border-slate-200 bg-white p-7 shadow-sm"><p className="text-xs font-semibold uppercase tracking-[0.18em] text-cyan-700">Nognog</p><h1 className="mt-3 text-2xl font-semibold">Forgot your password?</h1><p className="mt-2 text-sm text-slate-500">Enter your account email and we’ll send a secure reset link.</p><RequestPasswordResetForm /><Link href="/" className="mt-5 inline-block text-sm font-semibold text-cyan-700 hover:underline">Back to sign in</Link></section></main>;
}
