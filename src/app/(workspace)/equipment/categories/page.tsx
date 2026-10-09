import { IntentLink as Link } from "@/components/layout/intent-link";
import { archiveAssetCategoryAction } from "@/app/(workspace)/equipment/actions";
import { AssetCategoryForm } from "@/components/assets/asset-category-form";
import { Button } from "@/components/ui/button";
import { EmptyState } from "@/components/ui/empty-state";
import { PageHeader } from "@/components/ui/page-header";
import { RecordActionIcon } from "@/components/ui/record-action-menu";
import { requireManager } from "@/lib/auth";
import { getEquipmentCategories } from "@/lib/data/assets";
import { redirect } from "next/navigation";
export default async function AssetCategoriesPage({ searchParams }: { searchParams: Promise<{ kind?: string; edit?: string }> }) { await requireManager(); const params = await searchParams; if (params.kind === "vehicle") redirect("/vehicles"); const categories = await getEquipmentCategories(); const editing = params.edit ? categories.find((item) => item.id === params.edit) : undefined; return <>
  <PageHeader eyebrow="Equipment settings" title="Equipment categories" description="Manage the categories used to organize equipment." action={<Button variant="outline" asChild><Link href="/equipment">Back to equipment</Link></Button>} />
  <div className="mt-5 overflow-hidden rounded-xl border border-slate-200 bg-white"><AssetCategoryForm category={editing} />{categories.length === 0 ? <EmptyState kind="items" title="No equipment categories yet" /> : <div className="overflow-x-auto"><table className="w-full text-left"><thead className="bg-slate-50 text-[10px] uppercase tracking-[0.12em] text-slate-400"><tr><th className="px-5 py-3">Name</th><th className="px-4 py-3">Description</th><th className="px-5 py-3 text-right">Actions</th></tr></thead><tbody className="divide-y divide-slate-100">{categories.map((item) => <tr key={item.id}><td className="px-5 py-4 text-sm font-semibold">{item.name}</td><td className="px-4 py-4 text-xs text-slate-500">{item.description || "No description"}</td><td className="px-5 py-4"><div className="flex justify-end gap-1"><RecordActionIcon label="Edit" name={item.name} href={`/equipment/categories?edit=${item.id}`} /><form action={archiveAssetCategoryAction}><input type="hidden" name="id" value={item.id} /><RecordActionIcon label="Archive" name={item.name} submit destructive /></form></div></td></tr>)}</tbody></table></div>}</div>
  </>; }
