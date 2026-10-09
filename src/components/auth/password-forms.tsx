"use client";

import { useActionState, useEffect, useState } from "react";
import Link from "next/link";

import { requestPasswordResetAction, resetPasswordAction, setInvitedPasswordAction, type PasswordActionState } from "@/app/auth/password-actions";
import { FieldGuide } from "@/components/ui/field-guide";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { createClient } from "@/lib/supabase/browser";

const initialState: PasswordActionState = { ok: false, message: "" };

export function RequestPasswordResetForm() {
  const [state, action, pending] = useActionState(requestPasswordResetAction, initialState);
  return <form action={action} className="mt-7 space-y-4"><label className="grid gap-2 text-sm font-medium text-slate-700">Email address<Input type="email" name="email" autoComplete="email" required /><FieldGuide label="Email address" /></label>
    {state.message ? <p role={state.ok ? "status" : "alert"} className={`text-sm ${state.ok ? "text-emerald-700" : "text-red-700"}`}>{state.message}</p> : null}
    <Button type="submit" size="lg" className="w-full" disabled={pending}>{pending ? "Sending…" : "Send reset link"}</Button>
  </form>;
}

export function SetPasswordForm({ mode }: { mode: "invite" | "reset" }) {
  const [ready, setReady] = useState<boolean | null>(null);
  const [state, action, pending] = useActionState(mode === "invite" ? setInvitedPasswordAction : resetPasswordAction, initialState);
  useEffect(() => {
    let mounted = true;
    createClient().auth.getUser().then(({ data }) => { if (mounted) setReady(Boolean(data.user)); }).catch(() => { if (mounted) setReady(false); });
    return () => { mounted = false; };
  }, []);
  if (ready === null) return <p className="mt-7 text-sm text-slate-500">Checking your secure link…</p>;
  if (!ready) return <div className="mt-7 space-y-4"><p role="alert" className="text-sm text-red-700">This link is invalid or expired. Ask an administrator for a new invitation or request a password reset.</p><Link href="/" className="text-sm font-semibold text-cyan-700 hover:underline">Back to sign in</Link></div>;
  return <form action={action} className="mt-7 space-y-4">
    <label className="grid gap-2 text-sm font-medium text-slate-700">New password<Input type="password" name="password" autoComplete="new-password" minLength={12} maxLength={128} required /><FieldGuide label="New password" /></label>
    <label className="grid gap-2 text-sm font-medium text-slate-700">Confirm new password<Input type="password" name="confirmPassword" autoComplete="new-password" minLength={12} maxLength={128} required /><FieldGuide label="Confirm new password" /></label>
    {state.message ? <p role={state.ok ? "status" : "alert"} className="text-sm text-red-700">{state.message}</p> : null}
    <Button type="submit" size="lg" className="w-full" disabled={pending}>{pending ? "Saving…" : mode === "invite" ? "Activate account" : "Save new password"}</Button>
  </form>;
}
