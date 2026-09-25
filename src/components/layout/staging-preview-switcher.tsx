"use client";

import { useActionState } from "react";
import { switchStagingPreviewAccount, type PreviewSwitchState } from "@/app/auth/staging-preview-actions";
import type { PreviewAccount } from "@/lib/staging-preview";

const initialState: PreviewSwitchState = { message: "" };

export function StagingPreviewSwitcher({ accounts, currentEmail }: { accounts: PreviewAccount[]; currentEmail: string }) {
  const [state, action, pending] = useActionState(switchStagingPreviewAccount, initialState);
  return <div className="border-t border-slate-100 px-2 py-2"><p className="px-1 pb-1 text-xs font-semibold text-slate-500">Staging preview account</p><form action={action} className="max-h-52 overflow-y-auto">{accounts.map((account) => <button key={account.email} name="accountEmail" value={account.email} type="submit" disabled={pending || account.email.toLowerCase() === currentEmail.toLowerCase()} className="block w-full rounded-lg px-2 py-2 text-left text-sm text-slate-700 hover:bg-slate-50 disabled:cursor-default disabled:opacity-60">{account.label}{account.email.toLowerCase() === currentEmail.toLowerCase() ? " · Current" : ""}</button>)}</form>{state.message && <p role="alert" className="px-1 pt-1 text-xs text-red-700">{state.message}</p>}</div>;
}
