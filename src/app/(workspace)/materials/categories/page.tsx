import { IntentLink as Link } from "@/components/layout/intent-link";
import { CategoryForm } from "@/components/materials/category-form";
import { Button } from "@/components/ui/button";
import { DataTableShell } from "@/components/ui/data-table-shell";
import { EmptyState } from "@/components/ui/empty-state";
import { PageHeader } from "@/components/ui/page-header";
import { RecordActionIcon } from "@/components/ui/record-action-menu";
import { requireUser } from "@/lib/auth";
import { getMaterialCategories } from "@/lib/data/inventory";
import { archiveCategoryAction } from "../actions";

export default async function CategoriesPage({ searchParams }: { searchParams: Promise<{ edit?: string }> }) {
  const { edit } = await searchParams;
  const [user, categories] = await Promise.all([requireUser(), getMaterialCategories(false)]);
  const selected = user.canManage && edit ? categories.find((item) => item.id === edit) : undefined;
  return <>
    <PageHeader eyebrow="Inventory catalog" title="Material categories" description="Categories are stored once and reused throughout the catalog." action={<Button variant="outline" asChild><Link href="/materials">Back to materials</Link></Button>} />
    {user.canManage && <div className="mt-7 overflow-hidden rounded-xl border border-slate-200 bg-white"><CategoryForm category={selected} /></div>}
    <DataTableShell empty={categories.length === 0 ? <EmptyState kind="items" title="No material categories yet" /> : undefined}>
      <table className="w-full text-left"><thead className="bg-slate-50 text-[10px] uppercase tracking-[0.12em] text-slate-400"><tr><th className="px-5 py-3">Category</th><th className="px-4 py-3">Description</th>{user.canManage && <th className="px-5 py-3 text-right">Actions</th>}</tr></thead><tbody className="divide-y divide-slate-100">{categories.map((item) => <tr key={item.id}><td className="px-5 py-4 text-sm font-semibold">{item.name}</td><td className="px-4 py-4 text-sm text-slate-500">{item.description || "—"}</td>{user.canManage && <td className="px-5 py-4"><div className="flex justify-end gap-1"><RecordActionIcon label="Edit" name={item.name} href={`/materials/categories?edit=${item.id}`} /><form action={archiveCategoryAction}><input type="hidden" name="id" value={item.id} /><RecordActionIcon label="Archive" name={item.name} submit destructive /></form></div></td>}</tr>)}</tbody></table>
    </DataTableShell>
  </>;
}
