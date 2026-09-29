import { notFound } from "next/navigation";
import { MissingMaterialForm, MissingMaterialResolutionForm } from "@/components/requests/missing-material-form";
import { IntentLink as Link } from "@/components/layout/intent-link";
import { Button } from "@/components/ui/button";
import { PageHeader } from "@/components/ui/page-header";
import { requireUser } from "@/lib/auth";
import { getMaterialRequestChoices } from "@/lib/data/material-requests";
import { pageNumber } from "@/lib/data/pagination";
import { createClient } from "@/lib/supabase/server";

export default async function MissingMaterialsPage({ searchParams }: { searchParams: Promise<{ page?: string }> }) {
  const user = await requireUser();
  const canSubmit = user.roles.some((role) => role === "engineer" || role === "foreman");
  if (!user.canManage && !canSubmit) notFound();
  const page = pageNumber((await searchParams).page);
  const db = await createClient();
  const [choices, result] = await Promise.all([
    getMaterialRequestChoices(),
    db.from("material_sourcing_requests").select("*", { count: "exact" }).order("created_at", { ascending: false }).order("id").range((page - 1) * 20, page * 20 - 1),
  ]);
  if (result.error) throw new Error("Unable to load missing material reports.");
  const reports = result.data ?? [];
  return <>
    <PageHeader title="Missing materials" description="Report a needed item or stock shortage for Admin review." action={<Button variant="outline" asChild><Link href="/requests">All requests</Link></Button>} />
    {canSubmit && <section className="mt-6"><h2 className="mb-3 text-base font-semibold">Report a missing material</h2><MissingMaterialForm choices={choices} /></section>}
    <section className="mt-8"><h2 className="text-base font-semibold">Reports</h2>
      {reports.length === 0 ? <p className="mt-4 rounded-xl border border-slate-200 bg-white p-6 text-sm text-slate-500">No missing materials reported.</p> : <div className="mt-4 grid gap-3">{reports.map((item) => <article key={item.id} className="rounded-xl border border-slate-200 bg-white p-5">
        <div className="flex flex-wrap items-start justify-between gap-2"><div><h3 className="font-semibold">{item.material_name}</h3><p className="mt-1 text-xs text-slate-500">{item.project_name} · {item.site_name} · {item.warehouse_name}</p></div><span className="rounded-full bg-slate-100 px-2.5 py-1 text-xs font-medium capitalize">{item.status}</span></div>
        <p className="mt-3 text-sm text-slate-700">{item.requested_quantity} {item.unit_name} · Needed {item.needed_on}</p><p className="mt-1 text-sm text-slate-600">{item.reason}</p>
        {item.resolution_note && <p className="mt-3 text-sm text-slate-600">Review: {item.resolution_note}</p>}
        {user.canManage && item.status === "submitted" && <><div className="mt-3 flex flex-wrap gap-2"><Button variant="outline" size="sm" asChild><Link href="/materials/new">Add catalog material</Link></Button><Button variant="outline" size="sm" asChild><Link href="/purchase-orders/new">Purchase material</Link></Button></div><MissingMaterialResolutionForm id={item.id} materials={choices.materials} /></>}
      </article>)}</div>}
      {(page > 1 || (result.count ?? 0) > page * 20) && <nav aria-label="Missing material pages" className="mt-4 flex justify-end gap-3">{page > 1 && <Button variant="outline" asChild><Link href={`/requests/missing?page=${page - 1}`}>Previous</Link></Button>}{(result.count ?? 0) > page * 20 && <Button variant="outline" asChild><Link href={`/requests/missing?page=${page + 1}`}>Next</Link></Button>}</nav>}
    </section>
  </>;
}
