"use client";

import { Suspense } from "react";
import { usePathname, useSearchParams } from "next/navigation";
import { DetailPageSkeleton } from "./page-skeleton";
import { FieldsSkeleton, LoadingSpinner } from "./loading-state";
import { RecordCreateDialog } from "./record-create-dialog";
import { RecordDetailPanel } from "./record-detail-panel";

function RecordLoadingState() {
  const path = usePathname();
  const search = useSearchParams();
  if (search.get("edit") === "1") {
    const section = path.startsWith("/reports/daily/") ? "reports/daily" : path.split("/")[1];
    const names: Record<string, string> = { employees: "employee", suppliers: "supplier", materials: "material", equipment: "equipment", vehicles: "vehicle", warehouses: "warehouse", "reports/daily": "daily report" };
    return <RecordCreateDialog hideTrigger initialOpen title={`Edit ${names[section] ?? "record"}`} closeHref={`/${section}`}><FieldsSkeleton /></RecordCreateDialog>;
  }
  return <RecordDetailPanel title="Record details"><DetailPageSkeleton metrics={0} sections={1} /></RecordDetailPanel>;
}

export default function LoadingRecordDetails() {
  return <Suspense fallback={<LoadingSpinner />}><RecordLoadingState /></Suspense>;
}
