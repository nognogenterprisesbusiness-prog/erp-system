"use client";

import { useActionState, useState } from "react";
import { useRouter } from "next/navigation";
import { assignRequestWarehouseAction } from "@/app/(workspace)/requests/actions";
import { Button } from "@/components/ui/button";
import { SelectPicker } from "@/components/ui/select-picker";

export function RequestWarehouseAssignment({ id, kind, choices, current }: {
  id: string; kind: "request" | "shortage"; choices: { id: string; name: string; code: string; }[]; current: string | null;
}) {
  const router = useRouter();
  const [key] = useState(() => crypto.randomUUID());
  const [warehouse, setWarehouse] = useState(current ?? "");
  const [state, action, pending] = useActionState(async (previous: { ok: boolean; message: string }, form: FormData) => {
    const result = await assignRequestWarehouseAction(previous, form);
    if (result.ok) router.refresh();
    return result;
  }, { ok: false, message: "" });
  return <form action={action} className="mt-5 rounded-xl border border-slate-200 bg-white p-5">
    <input type="hidden" name="key" value={key} /><input type="hidden" name="id" value={id} /><input type="hidden" name="kind" value={kind} />
    <h2 className="text-base font-semibold">Source warehouse</h2>
    <p className="mt-1 text-sm text-slate-500">{kind === "request" ? "Choose the source warehouse for this request only. This does not link the warehouse permanently to the project." : "Choose a linked warehouse before sourcing."} Saving this choice does not reserve or deduct stock.</p>
    <div className="mt-3 flex flex-wrap items-center gap-3">
      <div className="w-full sm:max-w-sm"><SelectPicker label="Source warehouse" name="warehouseId" value={warehouse} onValueChange={setWarehouse} placeholder={choices.length ? "Choose warehouse" : "No warehouses available"} disabled={pending || state.ok || !choices.length} options={choices.map((item) => ({ value: item.id, label: `${item.code} · ${item.name}` }))} required /></div>
      <Button type="submit" disabled={pending || !warehouse || state.ok}>{pending ? "Saving…" : "Save warehouse"}</Button>
    </div>
    {choices.length === 0 && <p role="status" className="mt-3 text-sm text-amber-700">{kind === "request" ? "No active warehouse is available for your account, or this project is inactive. Ask Admin to check warehouse assignments and project status." : "No linked warehouse is available for sourcing. Ask Admin to check project warehouse assignments."}</p>}
    {state.message && <p role="status" className={`mt-3 text-sm ${state.ok ? "text-emerald-700" : "text-red-700"}`}>{state.message}</p>}
  </form>;
}
