"use client";
import { useActionState } from "react";
import { archiveAssetAction, type AssetActionState } from "@/app/(workspace)/equipment/actions";
import { Button } from "@/components/ui/button";
import { FormField, fieldControlClass } from "@/components/ui/form-field";
import type { AssetKind } from "@/types/database";
const initialState: AssetActionState = { ok: false, message: "" };
export function ArchiveAssetForm({ id, kind }: { id: string; kind: AssetKind }) { const [state, action, pending] = useActionState(archiveAssetAction, initialState); return <form action={action} className="mt-6 border-t border-slate-200 pt-5"><input type="hidden" name="id" value={id} /><input type="hidden" name="assetKind" value={kind} /><FormField label="Archive reason" htmlFor="reason" hint="The asset and its complete history remain available for audit."><textarea className={`${fieldControlClass} h-auto py-3`} id="reason" name="reason" rows={2} required /></FormField>{!state.ok && state.message && <p role="alert" className="mt-3 text-sm font-medium text-red-600">{state.message}</p>}<div className="mt-4 flex justify-end"><Button variant="outline" type="submit" disabled={pending}>{pending ? "Archiving…" : `Archive ${kind}`}</Button></div></form>; }
