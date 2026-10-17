"use client";

import { useActionState, useState } from "react";
import { useRouter } from "next/navigation";
import { assignRequestWarehouseAction } from "@/app/(workspace)/requests/actions";
import { Button } from "@/components/ui/button";
import { SelectPicker } from "@/components/ui/select-picker";

export function RequestWarehouseAssignment({ id, kind, choices, current, canLink = false, setupPending = false }: {
  id: string; kind: "request" | "shortage"; choices: { id: string; name: string; code: string; linked?: boolean }[]; current: string | null; canLink?: boolean; setupPending?: boolean;
}) {
  const router = useRouter();
  const [key] = useState(() => crypto.randomUUID());
  const [warehouse, setWarehouse] = useState(current ?? "");
  const [state, action, pending] = useActionState(async (previous: { ok: boolean; message: string }, form: FormData) => {
    const result = await assignRequestWarehouseAction(previous, form);
    if (result.ok) router.refresh();
    return result;
  }, { ok: false, message: "" });
  const needsLink = canLink && choices.some((item) => item.id === warehouse && item.linked === false);
  return <form action={action} className="mt-5 rounded-xl border border-slate-200 bg-white p-5">
    <input type="hidden" name="key" value={key} /><input type="hidden" name="id" value={id} /><input type="hidden" name="kind" value={kind} />
    <h2 className="text-base font-semibold">Source warehouse</h2>
    <p className="mt-1 text-sm text-slate-500">{canLink ? "Choose a source warehouse. An unlinked warehouse will be linked to this project when you save." : "Choose a linked warehouse before approval."} Saving this choice does not reserve or deduct stock.</p>
    <div className="mt-3 flex flex-wrap items-center gap-3">
      <div className="w-full sm:max-w-sm"><SelectPicker label="Source warehouse" name="warehouseId" value={warehouse} onValueChange={setWarehouse} placeholder={choices.length ? "Choose warehouse" : "No warehouses available"} disabled={pending || state.ok || !choices.length} options={choices.map((item) => ({ value: item.id, label: `${item.code} · ${item.name}${item.linked === false ? " · Not linked" : ""}` }))} required /></div>
      <Button type="submit" disabled={pending || !warehouse || state.ok}>{pending ? "Saving…" : needsLink ? "Link and select warehouse" : "Save warehouse"}</Button>
    </div>
    {setupPending && <p role="status" className="mt-3 text-sm text-amber-700">Warehouse setup needs the latest database update. Contact your system administrator.</p>}
    {!setupPending && choices.length === 0 && <p role="status" className="mt-3 text-sm text-amber-700">{canLink ? "No active warehouse is available, or this project is inactive. Check the warehouse and project status." : "No linked warehouse is available for your account. Ask Admin to link a warehouse to this project and check your warehouse assignment."}</p>}
    {state.message && <p role="status" className={`mt-3 text-sm ${state.ok ? "text-emerald-700" : "text-red-700"}`}>{state.message}</p>}
  </form>;
}
