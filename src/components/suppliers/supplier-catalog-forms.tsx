"use client";

import { useActionState } from "react";
import { archiveSupplierAction, type SupplierActionState } from "@/app/(workspace)/suppliers/actions";
import { Button } from "@/components/ui/button";

const initialState: SupplierActionState = { ok: false, message: "" };

function FormMessage({ state }: { state: SupplierActionState }) {
  if (!state.message) return null;
  return <p role="status" className={`text-xs font-medium ${state.ok ? "text-emerald-700" : "text-red-600"}`}>{state.message}</p>;
}

export function ArchiveSupplierForm({ supplierId }: { supplierId: string }) {
  const [state, action, pending] = useActionState(archiveSupplierAction, initialState);
  return <form action={action} className="flex flex-wrap items-center justify-end gap-2"><input type="hidden" name="id" value={supplierId} /><input className="h-10 min-w-52 rounded-lg border border-slate-200 px-3 text-sm" name="reason" placeholder="Archive reason" minLength={3} required /><Button variant="outline" disabled={pending}>{pending ? "Archiving…" : "Archive supplier"}</Button><FormMessage state={state} /></form>;
}
