"use client";

import { useRef } from "react";
import Image from "next/image";
import { Button } from "@/components/ui/button";
import { DialogHeading } from "@/components/ui/dialog-heading";

export function UserProfileButton({ id, name, email, phone, roles, status, hasPhoto }: {
  id: string;
  name: string;
  email: string;
  phone: string | null;
  roles: string;
  status: string;
  hasPhoto: boolean;
}) {
  const dialog = useRef<HTMLDialogElement>(null);
  const initials = name.split(/\s+/).map((part) => part[0]).slice(0, 2).join("").toUpperCase();
  const avatar = hasPhoto ? `/profile/avatar?userId=${encodeURIComponent(id)}` : undefined;
  return <>
    <button type="button" onClick={() => dialog.current?.showModal()} className="flex items-center gap-3 text-left hover:text-cyan-700 focus-visible:rounded-lg focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-cyan-600">
      <span aria-hidden className="relative grid size-9 shrink-0 place-items-center overflow-hidden rounded-full bg-cyan-50 text-xs font-semibold text-cyan-700">{avatar ? <Image src={avatar} alt="" fill sizes="36px" unoptimized className="object-cover" /> : initials}</span>
      <span><span className="block font-semibold">{name}</span><span className="block text-xs text-slate-500">{email}</span></span>
    </button>
    <dialog ref={dialog} aria-label={`${name} profile`} className="m-auto w-[min(100%-2rem,480px)] rounded-2xl border border-slate-200 bg-white p-6 text-[#07152d] shadow-2xl backdrop:bg-slate-950/45">
      <DialogHeading title={name} onClose={() => dialog.current?.close()} />
      <div className="mt-4"><span aria-hidden className="relative grid size-12 place-items-center overflow-hidden rounded-full bg-cyan-50 text-sm font-semibold text-cyan-700">{avatar ? <Image src={avatar} alt="" fill sizes="48px" unoptimized className="object-cover" /> : initials}</span></div>
      <dl className="mt-5 divide-y divide-slate-100">{[["Email", email], ["Phone", phone || "—"], ["Role", roles || "No role assigned"], ["Access", status]].map(([label, value]) => <div key={label} className="flex flex-wrap justify-between gap-4 py-3 text-sm"><dt className="text-slate-500">{label}</dt><dd className="font-medium text-slate-800">{value}</dd></div>)}</dl>
      <div className="mt-5 flex justify-end"><Button type="button" variant="outline" onClick={() => dialog.current?.close()}>Close</Button></div>
    </dialog>
  </>;
}
