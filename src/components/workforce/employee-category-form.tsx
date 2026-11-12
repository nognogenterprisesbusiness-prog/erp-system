"use client";

import { useActionState } from "react";
import { saveEmployeeCategoryAction, type WorkforceActionState } from "@/app/(workspace)/employees/actions";
import { RecordFormControls } from "@/components/ui/record-create-dialog";
import { FormField, fieldControlClass } from "@/components/ui/form-field";
import type { EmployeeCategoryRow } from "@/types/database";

const initialState: WorkforceActionState = { ok: false, message: "" };
export function EmployeeCategoryForm({ category }: { category?: EmployeeCategoryRow }) {
  const [state, action, pending] = useActionState(saveEmployeeCategoryAction, initialState);
  const error = (field: string) => state.ok ? undefined : state.fieldErrors?.[field]?.[0];
  return <form action={action} className="grid gap-4">
    {category && <input type="hidden" name="id" value={category.id} />}
    <FormField label="Job / trade name" htmlFor="name" error={error("name")}><input className={fieldControlClass} id="name" name="name" defaultValue={category?.name} required /></FormField>
    <FormField label="Description (optional)" htmlFor="description" error={error("description")}><input className={fieldControlClass} id="description" name="description" defaultValue={category?.description ?? ""} /></FormField>
    <RecordFormControls busy={pending} success={state.ok} label={category ? "Save changes" : "Add job / trade"} />
    {!state.ok && state.message && <p role="alert" className="text-sm font-medium text-red-600">{state.message}</p>}
  </form>;
}
