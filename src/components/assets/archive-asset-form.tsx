"use client";

import { startTransition, useActionState, useEffect, useRef } from "react";
import { useRouter } from "next/navigation";
import { archiveAssetAction, type AssetActionState } from "@/app/(workspace)/equipment/actions";
import { FormField, fieldControlClass } from "@/components/ui/form-field";
import { RecordFormControls, useRecordDialog } from "@/components/ui/record-create-dialog";
import type { AssetKind } from "@/types/database";

const initialState: AssetActionState = { ok: false, message: "" };
export function ArchiveAssetForm({ id, kind }: { id: string; kind: AssetKind }) {
  const [state, action, pending] = useActionState(archiveAssetAction, initialState);
  const dialog = useRecordDialog();
  const router = useRouter();
  const completed = useRef(false);
  useEffect(() => {
    if (!state.ok || completed.current) return;
    completed.current = true;
    if (dialog) dialog.complete();
    else startTransition(() => router.replace(kind === "equipment" ? "/equipment" : "/vehicles"));
  }, [state, dialog, router, kind]);
  return <form action={action} className="space-y-5">
    <input type="hidden" name="id" value={id} /><input type="hidden" name="assetKind" value={kind} />
    <p className="text-sm text-slate-500">This removes the {kind} from the active registry. Its history and project costs are preserved for audit.</p>
    <FormField label="Removal reason" htmlFor={`reason-${id}`}><textarea className={`${fieldControlClass} h-auto py-3`} id={`reason-${id}`} name="reason" rows={3} minLength={3} maxLength={2000} required /></FormField>
    {!state.ok && state.message && <p role="alert" className="text-sm text-red-600">{state.message}</p>}
    <RecordFormControls busy={pending} label={`Delete ${kind}`} />
  </form>;
}
