import { Suspense } from "react";
import { notFound } from "next/navigation";
import { EquipmentRequestsView } from "@/components/assets/equipment-requests-view";
import { MaterialRequestsList } from "@/components/requests/material-requests-list";
import { RequestTypeFilter, type RequestType } from "@/components/requests/request-type-filter";
import { ListFilterBar } from "@/components/ui/list-filter-bar";
import { SearchField } from "@/components/ui/search-field";
import { IntentLink as Link } from "@/components/layout/intent-link";
import { PlusSignIcon } from "@hugeicons/core-free-icons";
import { HugeiconsIcon } from "@hugeicons/react";
import { Button } from "@/components/ui/button";
import { PageHeader } from "@/components/ui/page-header";
import { TableSkeleton } from "@/components/ui/table-skeleton";
import { requireUser } from "@/lib/auth";

const descriptions: Record<RequestType, string> = {
  all: "Search and follow material, equipment, and vehicle requests in one place.",
  material: "Review material demand, manager decisions, and delivery progress.",
  equipment: "Request equipment and follow its approval and handover.",
  vehicle: "Request vehicles and follow their approval and handover.",
};

export default async function RequestsPage({ searchParams }: { searchParams: Promise<Record<string, string | string[] | undefined>> }) {
  const [params, user] = await Promise.all([searchParams, requireUser()]);
  const type: RequestType = params.type === "material" || params.type === "equipment" || params.type === "vehicle" ? params.type : "all";
  const canRequest = !user.canManage && user.roles.some((role) => ["engineer", "foreman"].includes(role));
  if (type !== "material" && !user.canManage && !canRequest) notFound();
  return <>
    <PageHeader title="Requests" description={descriptions[type]} action={(type === "material" || type === "all") && <div className="flex flex-wrap gap-2">{type === "material" && <Button variant="outline" asChild><Link href="/requests/missing">Missing materials</Link></Button>}{canRequest && <Button asChild><Link href="/requests/new"><HugeiconsIcon icon={PlusSignIcon} size={17} />New material request</Link></Button>}</div>} />
    {type === "all" && <ListFilterBar>
      <RequestTypeFilter showAssets={user.canManage || canRequest} defaultValue="all" />
      <SearchField name="q" label="Search requests" defaultValue={typeof params.q === "string" ? params.q : ""} placeholder="Search request numbers, equipment, or vehicles" />
    </ListFilterBar>}
    {/* Keyed by tab so switching type shows a table skeleton while the header and tabs stay put. */}
    <Suspense key={type} fallback={<TableSkeleton columns={type === "material" ? 7 : 6} filters={type === "material" ? 2 : 3} />}>
      {type === "all" ? <>
        <section aria-labelledby="material-requests-heading"><h2 id="material-requests-heading" className="mb-3 mt-6 text-base font-semibold text-slate-900">Material requests</h2><MaterialRequestsList params={params} canRequest={canRequest} showFilters={false} /></section>
        {(user.canManage || canRequest) && <>
          <section aria-labelledby="equipment-requests-heading"><h2 id="equipment-requests-heading" className="mb-3 mt-8 text-base font-semibold text-slate-900">Equipment requests</h2><EquipmentRequestsView params={params} kind="equipment" canManage={user.canManage} canRequest={canRequest} showFilters={false} listingType="all" /></section>
          <section aria-labelledby="vehicle-requests-heading"><h2 id="vehicle-requests-heading" className="mb-3 mt-8 text-base font-semibold text-slate-900">Vehicle requests</h2><EquipmentRequestsView params={params} kind="vehicle" canManage={user.canManage} canRequest={canRequest} showFilters={false} listingType="all" /></section>
        </>}
      </> : type === "material"
        ? <MaterialRequestsList params={params} canRequest={canRequest} showAssets={user.canManage || canRequest} />
        : <EquipmentRequestsView params={params} kind={type} canManage={user.canManage} canRequest={canRequest} />}
    </Suspense>
  </>;
}
