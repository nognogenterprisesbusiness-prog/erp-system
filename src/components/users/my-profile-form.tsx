"use client";
import { FieldGuide } from "@/components/ui/field-guide";

import { useActionState, useState } from "react";

import { updateMyProfileAction } from "@/app/(workspace)/profile/actions";
import { Button } from "@/components/ui/button";
import { fieldControlClass } from "@/components/ui/form-field";
import { RecordPhotoInput } from "@/components/ui/record-photo-input";

export function MyProfileForm({ fullName, phone, email, avatarUrl }: { fullName: string; phone: string | null; email: string; avatarUrl?: string }) {
  const [state, action, pending] = useActionState(updateMyProfileAction, { ok: false, message: "" });
  const [processingPhoto, setProcessingPhoto] = useState(false);
  return <form action={action} className="mt-5"><div className="grid gap-5 sm:grid-cols-2">
    <div className="sm:col-span-2"><RecordPhotoInput label="Profile picture" currentPhoto={avatarUrl} convertBeforeSubmit onProcessingChange={setProcessingPhoto} /></div>
    <label className="grid gap-1.5 text-sm font-medium text-slate-600">Full name<input name="fullName" className={fieldControlClass} defaultValue={fullName} minLength={2} maxLength={160} required autoComplete="name" /><FieldGuide label="Full name" name="fullName" /></label>
    <label className="grid gap-1.5 text-sm font-medium text-slate-600">Phone number<input name="phone" className={fieldControlClass} defaultValue={phone ?? ""} maxLength={40} autoComplete="tel" /><FieldGuide label="Phone number" name="phone" /></label>
    <label className="grid gap-1.5 text-sm font-medium text-slate-600 sm:col-span-2">Email address<input name="email" type="email" className={fieldControlClass} defaultValue={email} maxLength={320} required autoComplete="email" /><span className="text-sm font-normal text-slate-500">Changing your sign-in email requires confirmation before it takes effect.</span><FieldGuide label="Email address" name="email" type="email" /></label>
  </div><div className="mt-6 flex flex-wrap items-center justify-between gap-3">{state.message ? <p role={state.ok ? "status" : "alert"} className={`text-sm ${state.ok ? "text-emerald-700" : "text-red-700"}`}>{state.message}</p> : <span />}<Button type="submit" disabled={pending || processingPhoto} aria-busy={pending || processingPhoto}>{pending || processingPhoto ? <><span aria-hidden="true" className="size-4 animate-spin rounded-full border-2 border-current border-r-transparent motion-reduce:animate-none" />{processingPhoto ? "Preparing photo…" : "Saving profile…"}</> : "Save profile"}</Button></div></form>;
}
