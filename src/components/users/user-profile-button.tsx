"use client";

import { useRef } from "react";
import { AccountAvatar } from "@/components/ui/account-avatar";
import { Button } from "@/components/ui/button";
import { DialogHeading } from "@/components/ui/dialog-heading";

export function UserProfileButton({ name, email, phone, roles, status, avatarUrl }: {
  name: string;
  email: string;
  phone: string | null;
  roles: string;
  status: string;
  avatarUrl?: string;
}) {
  const dialog = useRef<HTMLDialogElement>(null);
  return <>
    <button type="button" onClick={() => dialog.current?.showModal()} className="flex items-center gap-3 text-left hover:text-cyan-700 focus-visible:rounded-full focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-cyan-600">
      <AccountAvatar name={name} photo={avatarUrl} className="bg-cyan-50 font-semibold text-cyan-700" />
      <span><span className="block font-semibold">{name}</span><span className="block text-xs text-slate-500">{email}</span></span>
    </button>
    <dialog ref={dialog} aria-label={`${name} profile`} className="m-auto w-[min(100%-2rem,480px)] rounded-2xl border border-slate-200 bg-white p-6 text-[#07152d] shadow-2xl backdrop:bg-slate-950/45">
      <DialogHeading title={name} onClose={() => dialog.current?.close()} />
      <div className="mt-4"><AccountAvatar name={name} photo={avatarUrl} className="size-12 text-sm bg-cyan-50 font-semibold text-cyan-700" /></div>
      <dl className="mt-5 divide-y divide-slate-100">{[["Email", email], ["Phone", phone || "—"], ["Role", roles || "No role assigned"], ["Access", status]].map(([label, value]) => <div key={label} className="flex flex-wrap justify-between gap-4 py-3 text-sm"><dt className="text-slate-500">{label}</dt><dd className="font-medium text-slate-800">{value}</dd></div>)}</dl>
      <div className="mt-5 flex justify-end"><Button type="button" variant="outline" onClick={() => dialog.current?.close()}>Close</Button></div>
    </dialog>
  </>;
}
