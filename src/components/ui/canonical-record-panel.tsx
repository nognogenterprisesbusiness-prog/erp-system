"use client";

import { Suspense, type ReactNode } from "react";
import { useSearchParams } from "next/navigation";
import { RecordDetailPanel } from "./record-detail-panel";
import { DetailPageSkeleton } from "./page-skeleton";

/** Hard navigation uses the same panel as intercepted navigation, over its authorized list. */
export function CanonicalRecordPanel({ title, closeHref, background, children, supportsEditor = false }: {
  title: string; closeHref: string; background: ReactNode; children: ReactNode; supportsEditor?: boolean;
}) {
  const search = useSearchParams();
  const editing = supportsEditor && search.get("edit") === "1";
  return <>
    {background}
    {editing ? children : <RecordDetailPanel title={title} closeHref={closeHref}>
      <Suspense fallback={<DetailPageSkeleton metrics={0} sections={1} />}>{children}</Suspense>
    </RecordDetailPanel>}
  </>;
}
