import { Suspense } from "react";
import { notFound } from "next/navigation";
import { EquipmentRequestsView } from "@/components/assets/equipment-requests-view";
import { MaterialRequestsList } from "@/components/requests/material-requests-list";
import { MissingMaterialsView } from "@/components/requests/missing-materials-view";
import { RequestTypeNav, type RequestType } from "@/components/requests/request-type-nav";
import { IntentLink as Link } from "@/components/layout/intent-link";
import { PlusSignIcon } from "@hugeicons/core-free-icons";
import { HugeiconsIcon } from "@hugeicons/react";
import { Button } from "@/components/ui/button";
import { PageHeader } from "@/components/ui/page-header";
import { TableSkeleton } from "@/components/ui/table-skeleton";
import { requireUser } from "@/lib/auth";

const descriptions: Record<RequestType, string> = {
  material: "Review material demand, manager decisions, and delivery progress.",
  equipment: "Request equipment and follow its approval and handover.",
  vehicle: "Request vehicles and follow their approval and handover.",
};

export default async function RequestsPage({ searchParams }: { searchParams: Promise<Record<string, string | string[] | undefined>> }) {
  const [params, user] = await Promise.all([searchParams, requireUser()]);
  const type: RequestType = params.type === "equipment" || params.type === "vehicle" ? params.type : "material";
  const missing = type === "material" && params.view === "missing";
  const canRequest = !user.canManage && user.roles.some((role) => ["engineer", "foreman"].includes(role));
  if (type !== "material" && !user.canManage && !canRequest) notFound();
  return <>
    <PageHeader title="Requests" description={missing ? "Report out-of-stock materials and follow site request progress." : descriptions[type]} action={type === "material" && <div className="flex flex-wrap gap-2">{(user.canManage || canRequest) && <Button variant="outline" asChild><Link href={missing ? "/requests" : "/requests?view=missing"}>{missing ? "Material requests" : "Out-of-stock reports"}</Link></Button>}{canRequest && !missing && <Button asChild><Link href="/requests/new"><HugeiconsIcon icon={PlusSignIcon} size={17} />New material request</Link></Button>}</div>} />
    <RequestTypeNav active={type} showAssets={user.canManage || canRequest} />
    {/* Keyed by tab so switching type shows a table skeleton while the header and tabs stay put. */}
    <Suspense key={`${type}:${missing}`} fallback={<TableSkeleton columns={type === "material" ? 7 : 6} filters={type === "material" ? 2 : 3} />}>
      {missing ? <MissingMaterialsView pageParam={typeof params.page === "string" ? params.page : undefined} /> : type === "material"
        ? <MaterialRequestsList params={params} canRequest={canRequest} />
        : <EquipmentRequestsView params={params} kind={type} canManage={user.canManage} canRequest={canRequest} />}
    </Suspense>
  </>;
}
