"use client";

import { useActionState, useRef, useState } from "react";
import { PlusSignIcon } from "@hugeicons/core-free-icons";
import { HugeiconsIcon } from "@hugeicons/react";

import { assignInitialRoleAction, inviteUserAction, sendManagedPasswordResetAction, setUserActiveAction, type UserActionState } from "@/app/(workspace)/users/actions";
import { Button } from "@/components/ui/button";
import { DialogHeading } from "@/components/ui/dialog-heading";
import { fieldControlClass } from "@/components/ui/form-field";
import { SelectPicker } from "@/components/ui/select-picker";
import { roleLabels } from "@/lib/users/access";
import type { AppRole } from "@/types/database";

const initialState: UserActionState = { ok: false, message: "" };

function UserInviteForm({ roles, onClose }: { roles: AppRole[]; onClose: () => void }) {
  const [state, action, pending] = useActionState(inviteUserAction, initialState);
  const [role, setRole] = useState("");
  return <form action={action} className="grid gap-4">
    <DialogHeading id="add-user-title" title="Add user" onClose={onClose} disabled={pending} />
    {state.ok ? <p role="status" className="rounded-lg bg-emerald-50 p-3 text-sm text-emerald-700">{state.message}</p> : <>
    <p className="text-sm text-slate-500">An invitation will be sent by email. The user sets their own password.</p>
    <div className="grid gap-4">
      <label className="grid gap-1.5 text-xs font-medium text-slate-600">Full name<input className={fieldControlClass} name="fullName" autoComplete="name" minLength={2} maxLength={160} required /></label>
      <label className="grid gap-1.5 text-xs font-medium text-slate-600">Email address<input className={fieldControlClass} name="email" type="email" autoComplete="email" required /></label>
      <label className="grid gap-1.5 text-xs font-medium text-slate-600">Initial role<SelectPicker label="Initial role" name="role" value={role} onValueChange={setRole} placeholder="Select role" options={roles.map((item) => ({ value: item, label: roleLabels[item] }))} /></label>
    </div>
    {state.message && <p role="alert" className="text-sm text-red-700">{state.message}</p>}
    </>}
    <div className="flex justify-end gap-2"><Button type="button" variant="outline" onClick={onClose} disabled={pending}>{state.ok ? "Close" : "Cancel"}</Button>{!state.ok && <Button type="submit" disabled={pending || !role}>{pending ? "Sending…" : "Send invitation"}</Button>}</div>
  </form>;
}

export function UserInviteDialog({ roles }: { roles: AppRole[] }) {
  const dialog = useRef<HTMLDialogElement>(null);
  const [formKey, setFormKey] = useState(0);
  function close() { dialog.current?.close(); }
  return <>
    <Button onClick={() => { setFormKey((value) => value + 1); dialog.current?.showModal(); }} disabled={!roles.length}><HugeiconsIcon icon={PlusSignIcon} size={17} strokeWidth={1.6} />Add user</Button>
    <dialog ref={dialog} aria-labelledby="add-user-title" className="m-auto w-[min(100%-2rem,460px)] rounded-2xl border border-slate-200 bg-white p-6 text-[#07152d] shadow-2xl backdrop:bg-slate-950/45"><UserInviteForm key={formKey} roles={roles} onClose={close} /></dialog>
  </>;
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
