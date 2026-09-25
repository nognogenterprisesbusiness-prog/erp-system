import Link from "next/link";
import { redirect } from "next/navigation";
import { uuidSchema } from "@nognog/domain";
import { SiteConsumptionForm } from "@/components/inventory/site-consumption-form";
import { Button } from "@/components/ui/button";
import { EmptyState } from "@/components/ui/empty-state";
import { PageHeader } from "@/components/ui/page-header";
import { requireUser } from "@/lib/auth";
import { getSiteConsumptionOptions } from "@/lib/data/inventory";

export default async function SiteConsumptionPage({ searchParams }: { searchParams: Promise<{ material?: string }> }) {
  const user = await requireUser();
  if (!user.canManage && !user.roles.some((role) => ["project_manager", "engineer", "foreman"].includes(role))) redirect("/inventory");
  const options = await getSiteConsumptionOptions();
  const parsed = uuidSchema.safeParse((await searchParams).material);
  const hasSiteStock = options.balances.length > 0;
  return <>
    <PageHeader title="Record site material use" description="Only actual consumed quantity leaves site stock and is costed to the project at its current weighted-average value." action={<Button asChild variant="outline"><Link href="/inventory">Back to inventory</Link></Button>} />
    <div className="mt-7">{hasSiteStock ? <SiteConsumptionForm {...options} initialMaterialId={parsed.success ? parsed.data : ""} /> : <section className="rounded-xl border border-slate-200 bg-white"><EmptyState kind="items" title="No site stock available" description="Receive material at an assigned project site before recording consumption." /></section>}</div>
  </>;
}
