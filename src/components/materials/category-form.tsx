"use client";
import { useActionState } from "react";
import { saveCategoryAction, type MaterialActionState } from "@/app/(workspace)/materials/actions";
import { Button } from "@/components/ui/button";
import { FormField, fieldControlClass } from "@/components/ui/form-field";
import type { MaterialCategoryRow } from "@/types/database";
const initialState: MaterialActionState = { ok: false, message: "" };
export function CategoryForm({ category }: { category?: MaterialCategoryRow }) { const [state, action, pending] = useActionState(saveCategoryAction, initialState); return <form action={action} className="grid gap-4 border-b border-slate-200 bg-slate-50/60 p-5 md:grid-cols-[minmax(180px,0.8fr)_minmax(240px,1.4fr)_auto] md:items-end">{category && <input type="hidden" name="id" value={category.id} />}<FormField label="Category name" htmlFor="name" error={!state.ok ? state.fieldErrors?.name?.[0] : undefined}><input className={fieldControlClass} id="name" name="name" defaultValue={category?.name} required /></FormField><FormField label="Description" htmlFor="description" error={!state.ok ? state.fieldErrors?.description?.[0] : undefined}><input className={fieldControlClass} id="description" name="description" defaultValue={category?.description ?? ""} /></FormField><Button type="submit" disabled={pending}>{pending ? "Saving…" : category ? "Save category" : "Add category"}</Button>{!state.ok && state.message && <p role="alert" className="text-sm font-medium text-red-600 md:col-span-3">{state.message}</p>}</form>; }
