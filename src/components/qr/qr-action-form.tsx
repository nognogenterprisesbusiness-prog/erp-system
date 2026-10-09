"use client";

import { getFieldPlaceholder } from "@/components/ui/field-placeholder";
import { useActionState } from "react";
import { generateQrAction, changeQrAction, type QrActionState } from "@/app/(workspace)/qr-codes/actions";
import { Button } from "@/components/ui/button";
import type { QrEntityType } from "@/types/database";

const initialState: QrActionState = { error: "" };

export function GenerateQrForm({ entityType, entityId }: { entityType: QrEntityType; entityId: string }) {
  const [state, action, pending] = useActionState(generateQrAction, initialState);
  return <form action={action} className="flex flex-col items-start gap-2">
    <input type="hidden" name="entityType" value={entityType} /><input type="hidden" name="entityId" value={entityId} />
    <Button type="submit" size="sm" disabled={pending}>{pending ? "Generating…" : "Generate QR code"}</Button>
    {state.error && <p role="alert" className="text-xs text-red-700">{state.error}</p>}
  </form>;
}

export function ChangeQrForm({ id }: { id: string }) {
  const [state, action, pending] = useActionState(changeQrAction, initialState);
  return <form action={action} className="space-y-3">
    <input type="hidden" name="id" value={id} />
    <label htmlFor="qr-reason" className="block text-sm font-medium">Reason for changing this label</label>
    <input id="qr-reason" name="reason" required minLength={2} maxLength={500} placeholder={getFieldPlaceholder("Reason for changing this label")} className="h-10 w-full rounded-lg border border-slate-200 px-3 text-sm focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-cyan-600" />

    <div className="flex flex-wrap gap-2"><Button name="operation" value="replace" type="submit" disabled={pending}>Replace label</Button><Button name="operation" value="deactivate" type="submit" variant="outline" disabled={pending}>Deactivate</Button></div>
    {state.error && <p role="alert" className="text-xs text-red-700">{state.error}</p>}
  </form>;
}
