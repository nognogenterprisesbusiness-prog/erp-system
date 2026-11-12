"use client";

import { useActionState, useState } from "react";
import { archiveEmployeeCategoryAction, type WorkforceActionState } from "@/app/(workspace)/employees/actions";
import { Button } from "@/components/ui/button";
import { RecordActionMenu } from "@/components/ui/record-action-menu";
import { RecordCreateDialog, RecordFormControls } from "@/components/ui/record-create-dialog";
import { EmployeeCategoryForm } from "./employee-category-form";
import type { EmployeeCategoryRow } from "@/types/database";

type Mode = { kind: "list" } | { kind: "add" } | { kind: "edit" | "archive"; category: EmployeeCategoryRow };

export function EmployeeTradesDialog({ categories, initialOpen = false, editId, closeHref }: { categories: EmployeeCategoryRow[]; initialOpen?: boolean; editId?: string; closeHref?: string }) {
  return <RecordCreateDialog title="Jobs / trades" triggerLabel="Jobs / trades" triggerVariant="outline" triggerIcon={null} initialOpen={initialOpen} closeHref={closeHref}>
    <TradeManager categories={categories} editId={editId} />
  </RecordCreateDialog>;
}

function TradeManager({ categories, editId }: { categories: EmployeeCategoryRow[]; editId?: string }) {
  const [mode, setMode] = useState<Mode>(() => {
    const category = categories.find((item) => item.id === editId);
    return category ? { kind: "edit", category } : { kind: "list" };
  });
  if (mode.kind !== "list") return <div className="grid gap-4">
    <h3 className="font-semibold">{mode.kind === "add" ? "Add job / trade" : mode.kind === "edit" ? `Edit ${mode.category.name}` : `Archive ${mode.category.name}`}</h3>
    {mode.kind === "archive" ? <ArchiveTradeForm category={mode.category} /> : <EmployeeCategoryForm category={mode.kind === "edit" ? mode.category : undefined} />}
  </div>;
  return <div className="grid gap-5">
    <div className="flex flex-wrap items-center justify-between gap-3"><p className="max-w-md text-sm leading-6 text-slate-600">The jobs employees do, such as Engineer, Mason or Driver. These do not change account permissions.</p><Button type="button" onClick={() => setMode({ kind: "add" })}>Add job / trade</Button></div>
    {categories.length === 0 ? <p className="py-5 text-sm text-slate-500">No jobs / trades yet. Add one to use when entering an employee.</p> : <ul className="divide-y divide-slate-100 rounded-xl border border-slate-200">{categories.map((category) => <li key={category.id} className="flex items-center gap-4 px-4 py-3"><div className="min-w-0 flex-1"><p className="break-words text-sm font-semibold">{category.name}</p>{category.description && <p className="mt-1 break-words text-sm text-slate-500">{category.description}</p>}</div><RecordActionMenu name={category.name} actions={[{ label: "Edit", onSelect: () => setMode({ kind: "edit", category }) }, { label: "Archive", destructive: true, onSelect: () => setMode({ kind: "archive", category }) }]} /></li>)}</ul>}
  </div>;
}

function ArchiveTradeForm({ category }: { category: EmployeeCategoryRow }) {
  const [state, action, pending] = useActionState(archiveEmployeeCategoryAction, { ok: false, message: "" } as WorkforceActionState);
  return <form action={action} className="grid gap-4"><input type="hidden" name="id" value={category.id} /><p className="text-sm leading-6 text-slate-600">Archive <strong>{category.name}</strong>? It will no longer be available for new employees. Move employees to another job / trade first. Existing history is kept.</p>{!state.ok && state.message && <p role="alert" className="text-sm text-red-700">{state.message}</p>}<RecordFormControls busy={pending} success={state.ok} label="Confirm archive" /></form>;
}
