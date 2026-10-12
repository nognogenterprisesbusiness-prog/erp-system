"use client";

import { useActionState, useState } from "react";
import { useRouter } from "next/navigation";
import { assignRequestWarehouseAction } from "@/app/(workspace)/requests/actions";
import { Button } from "@/components/ui/button";
import { SelectPicker } from "@/components/ui/select-picker";

export function RequestWarehouseAssignment({ id, kind, choices, current }: {
  id: string; kind: "request" | "shortage"; choices: { id: string; name: string; code: string }[]; current: string | null;
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
    <p className="mt-1 text-sm text-slate-500">Choose the linked warehouse before approval. Saving this choice does not reserve or deduct stock.</p>
    <div className="mt-3 flex flex-wrap items-center gap-3">
      <div className="w-full sm:max-w-sm"><SelectPicker label="Source warehouse" name="warehouseId" value={warehouse} onValueChange={setWarehouse} disabled={pending || state.ok} options={choices.map((item) => ({ value: item.id, label: `${item.code} · ${item.name}` }))} required /></div>
      <Button type="submit" disabled={pending || !warehouse || state.ok}>{pending ? "Saving…" : "Save warehouse"}</Button>
    </div>
    {choices.length === 0 && <p className="mt-3 text-sm text-amber-700">No linked warehouse is available for your account. Ask Admin to check the project warehouse assignments.</p>}
    {state.message && <p role="status" className={`mt-3 text-sm ${state.ok ? "text-emerald-700" : "text-red-700"}`}>{state.message}</p>}
  </form>;
}
