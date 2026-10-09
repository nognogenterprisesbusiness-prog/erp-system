"use client";
import { useActionState } from "react";
import { saveAssetCategoryAction, type AssetActionState } from "@/app/(workspace)/equipment/actions";
import { Button } from "@/components/ui/button";
import { FormField, fieldControlClass } from "@/components/ui/form-field";
import type { AssetCategoryRow } from "@/types/database";
const initialState: AssetActionState = { ok: false, message: "" };
export function AssetCategoryForm({ category }: { category?: AssetCategoryRow }) { const [state, action, pending] = useActionState(saveAssetCategoryAction, initialState); const error = (field: string) => state.ok ? undefined : state.fieldErrors?.[field]?.[0]; return <form action={action} className="border-b border-slate-200 bg-slate-50/60 p-5"><input type="hidden" name="assetKind" value="equipment" />{category && <input type="hidden" name="id" value={category.id} />}<div className="grid gap-4 md:grid-cols-[1fr_1.5fr_auto] md:items-end"><FormField label="Category name" htmlFor="name" error={error("name")}><input className={fieldControlClass} id="name" name="name" defaultValue={category?.name} required /></FormField><FormField label="Description" htmlFor="description" error={error("description")}><input className={fieldControlClass} id="description" name="description" defaultValue={category?.description ?? ""} /></FormField><Button type="submit" disabled={pending}>{pending ? "Saving…" : category ? "Save" : "Add"}</Button></div>{!state.ok && state.message && <p role="alert" className="mt-3 text-sm font-medium text-red-600">{state.message}</p>}</form>; }
