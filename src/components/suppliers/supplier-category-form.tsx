"use client";

import { useActionState } from "react";
import { archiveSupplierCategoryAction, saveSupplierCategoryAction, type SupplierActionState } from "@/app/(workspace)/suppliers/actions";
import { Button } from "@/components/ui/button";
import { FormField, fieldControlClass } from "@/components/ui/form-field";
import { RecordActionIcon } from "@/components/ui/record-action-menu";
import type { SupplierCategoryRow } from "@/types/database";

const initialState: SupplierActionState = { ok: false, message: "" };
export function SupplierCategoryForm({ category }: { category?: SupplierCategoryRow }) {
  const [state, action, pending] = useActionState(saveSupplierCategoryAction, initialState);
  const error = (field: string) => state.ok ? undefined : state.fieldErrors?.[field]?.[0];
  return <form action={action} className="grid gap-4 border-b border-slate-100 p-5 md:grid-cols-[1fr_2fr_auto] md:items-end">{category && <input type="hidden" name="id" value={category.id} />}<FormField label="Category name" htmlFor="name" error={error("name")}><input className={fieldControlClass} id="name" name="name" defaultValue={category?.name} required /></FormField><FormField label="Description" htmlFor="description" error={error("description")}><input className={fieldControlClass} id="description" name="description" defaultValue={category?.description ?? ""} /></FormField><Button type="submit" disabled={pending}>{pending ? "Saving…" : category ? "Update" : "Add category"}</Button>{!state.ok && state.message && <p role="alert" className="text-sm font-medium text-red-600 md:col-span-3">{state.message}</p>}</form>;
}

export function ArchiveSupplierCategoryForm({ categoryId, categoryName }: { categoryId: string; categoryName: string }) {
  const [state, action, pending] = useActionState(archiveSupplierCategoryAction, initialState);
  return <form action={action} className="flex items-center gap-2"><input type="hidden" name="id" value={categoryId} /><RecordActionIcon label="Archive" name={categoryName} submit destructive disabled={pending} />{state.message && <span role={state.ok ? "status" : "alert"} className={`text-xs ${state.ok ? "text-emerald-700" : "text-red-600"}`}>{state.message}</span>}</form>;
}
