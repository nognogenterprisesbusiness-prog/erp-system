import { SetPasswordForm } from "@/components/auth/password-forms";

export default function AcceptInvitePage() {
  return <main className="grid min-h-svh place-items-center bg-[#f5f6f8] px-5 py-10"><section className="w-full max-w-sm rounded-xl border border-slate-200 bg-white p-7 shadow-sm"><p className="text-xs font-semibold uppercase tracking-[0.18em] text-cyan-700">Nognog Enterprises</p><h1 className="mt-3 text-2xl font-semibold">Set your password</h1><p className="mt-2 text-sm text-slate-500">Your invitation is almost ready. Choose a private password to access the workspace.</p><SetPasswordForm mode="invite" /></section></main>;
}
