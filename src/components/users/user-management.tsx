"use client";

import { useActionState } from "react";

import { assignInitialRoleAction, inviteUserAction, sendManagedPasswordResetAction, setUserActiveAction, type UserActionState } from "@/app/(workspace)/users/actions";
import { Button } from "@/components/ui/button";
import { fieldControlClass } from "@/components/ui/form-field";
import { roleLabels } from "@/lib/users/access";
import type { AppRole } from "@/types/database";

const initialState: UserActionState = { ok: false, message: "" };

export function UserInviteForm({ roles }: { roles: AppRole[] }) {
  const [state, action, pending] = useActionState(inviteUserAction, initialState);
  return <form action={action} className="rounded-xl border border-slate-200 bg-white p-5 sm:p-6">
    <h2 className="text-base font-semibold text-slate-900">Invite a team member</h2>
    <p className="mt-1 text-xs text-slate-500">They will receive an invitation and set their own password. No temporary password is shared.</p>
    <div className="mt-5 grid gap-4 md:grid-cols-3">
      <label className="grid gap-1.5 text-xs font-medium text-slate-600">Full name<input className={fieldControlClass} name="fullName" autoComplete="name" minLength={2} maxLength={160} required /></label>
      <label className="grid gap-1.5 text-xs font-medium text-slate-600">Email address<input className={fieldControlClass} name="email" type="email" autoComplete="email" required /></label>
      <label className="grid gap-1.5 text-xs font-medium text-slate-600">Initial role<select className={fieldControlClass} name="role" required defaultValue=""><option value="" disabled>Select role</option>{roles.map((role) => <option key={role} value={role}>{roleLabels[role]}</option>)}</select></label>
    </div>
    <div className="mt-5 flex flex-wrap items-center justify-between gap-3">{state.message ? <p role={state.ok ? "status" : "alert"} className={`text-xs ${state.ok ? "text-emerald-700" : "text-red-700"}`}>{state.message}</p> : <span />}
      <Button type="submit" disabled={pending}>{pending ? "Sending invitation…" : "Send invitation"}</Button>
    </div>
  </form>;
}

export function InitialRoleForm({ userId, roles }: { userId: string; roles: AppRole[] }) {
  const [state, action, pending] = useActionState(assignInitialRoleAction, initialState);
  return <form action={action} className="flex flex-wrap items-center justify-end gap-2">
    <input type="hidden" name="userId" value={userId} />
    <select name="role" aria-label="Initial role" className="h-9 rounded-md border border-slate-200 bg-white px-2 text-xs" defaultValue="" required><option value="" disabled>Select role</option>{roles.map((role) => <option key={role} value={role}>{roleLabels[role]}</option>)}</select>
    <Button type="submit" size="sm" disabled={pending}>Assign role</Button>
    {state.message ? <span role={state.ok ? "status" : "alert"} className={`w-full text-right text-xs ${state.ok ? "text-emerald-700" : "text-red-700"}`}>{state.message}</span> : null}
  </form>;
}

export function UserStatusForm({ userId, isActive }: { userId: string; isActive: boolean }) {
  const [state, action, pending] = useActionState(setUserActiveAction, initialState);
  return <form action={action} onSubmit={(event) => { if (isActive && !window.confirm("Deactivate this account? The person will lose ERP access immediately.")) event.preventDefault(); }} className="flex flex-col items-end gap-1">
    <input type="hidden" name="userId" value={userId} />
    <input type="hidden" name="isActive" value={String(!isActive)} />
    <Button type="submit" size="sm" variant="outline" disabled={pending}>{pending ? "Saving…" : isActive ? "Deactivate" : "Reactivate"}</Button>
    {state.message ? <span role={state.ok ? "status" : "alert"} className={`text-right text-xs ${state.ok ? "text-emerald-700" : "text-red-700"}`}>{state.message}</span> : null}
  </form>;
}

export function UserPasswordResetForm({ userId }: { userId: string }) {
  const [state, action, pending] = useActionState(sendManagedPasswordResetAction, initialState);
  return <form action={action} onSubmit={(event) => { if (!window.confirm("Send a password-reset link to this user?")) event.preventDefault(); }} className="flex flex-col items-end gap-1">
    <input type="hidden" name="userId" value={userId} />
    <Button type="submit" size="sm" variant="outline" disabled={pending}>{pending ? "Sending…" : "Reset password"}</Button>
    {state.message ? <span role={state.ok ? "status" : "alert"} className={`max-w-48 text-right text-xs ${state.ok ? "text-emerald-700" : "text-red-700"}`}>{state.message}</span> : null}
  </form>;
}
