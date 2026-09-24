"use client";

import { useActionState } from "react";
import { saveEmployeeCategoryAction, type WorkforceActionState } from "@/app/(workspace)/employees/actions";
import { Button } from "@/components/ui/button";
import { FormField, fieldControlClass } from "@/components/ui/form-field";
import type { EmployeeCategoryRow } from "@/types/database";

const initialState: WorkforceActionState = { ok: false, message: "" };
export function EmployeeCategoryForm({ category }: { category?: EmployeeCategoryRow }) {
  const [state, action, pending] = useActionState(saveEmployeeCategoryAction, initialState);
  const error = (field: string) => state.ok ? undefined : state.fieldErrors?.[field]?.[0];
  return <form action={action} className="grid gap-4 border-b border-slate-100 p-5 md:grid-cols-[1fr_2fr_auto] md:items-end">
    {category && <input type="hidden" name="id" value={category.id} />}
    <FormField label="Category name" htmlFor="name" error={error("name")}><input className={fieldControlClass} id="name" name="name" defaultValue={category?.name} required /></FormField>
    <FormField label="Description" htmlFor="description" error={error("description")}><input className={fieldControlClass} id="description" name="description" defaultValue={category?.description ?? ""} /></FormField>
    <Button type="submit" disabled={pending}>{pending ? "Saving…" : category ? "Update" : "Add category"}</Button>
    {!state.ok && state.message && <p role="alert" className="text-sm font-medium text-red-600 md:col-span-3">{state.message}</p>}
  </form>;
}
