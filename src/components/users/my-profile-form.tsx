"use client";

import { useActionState } from "react";

import { updateMyProfileAction } from "@/app/(workspace)/profile/actions";
import { Button } from "@/components/ui/button";
import { fieldControlClass } from "@/components/ui/form-field";
import { RecordPhotoInput } from "@/components/ui/record-photo-input";

export function MyProfileForm({ fullName, phone, email, avatarUrl }: { fullName: string; phone: string | null; email: string; avatarUrl?: string }) {
  const [state, action, pending] = useActionState(updateMyProfileAction, { ok: false, message: "" });
  return <form action={action} className="mt-7 max-w-2xl rounded-xl border border-slate-200 bg-white p-5 sm:p-6"><div className="grid gap-5 sm:grid-cols-2">
    <div className="sm:col-span-2"><RecordPhotoInput label="Profile picture" currentPhoto={avatarUrl} convertBeforeSubmit /></div>
    <label className="grid gap-1.5 text-sm font-medium text-slate-600">Full name<input name="fullName" className={fieldControlClass} defaultValue={fullName} minLength={2} maxLength={160} required autoComplete="name" /></label>
    <label className="grid gap-1.5 text-sm font-medium text-slate-600">Phone number<input name="phone" className={fieldControlClass} defaultValue={phone ?? ""} maxLength={40} autoComplete="tel" /></label>
    <label className="grid gap-1.5 text-sm font-medium text-slate-600 sm:col-span-2">Email address<input name="email" type="email" className={fieldControlClass} defaultValue={email} maxLength={320} required autoComplete="email" /><span className="text-sm font-normal text-slate-500">Changing your sign-in email requires confirmation before it takes effect.</span></label>
  </div><div className="mt-6 flex flex-wrap items-center justify-between gap-3">{state.message ? <p role={state.ok ? "status" : "alert"} className={`text-sm ${state.ok ? "text-emerald-700" : "text-red-700"}`}>{state.message}</p> : <span />}<Button type="submit" disabled={pending}>{pending ? "Saving…" : "Save profile"}</Button></div></form>;
}
