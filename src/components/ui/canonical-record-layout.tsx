import { Suspense, type ReactNode } from "react";
import { CanonicalRecordPanel } from "./canonical-record-panel";
import { TableSkeleton } from "./table-skeleton";

export function CanonicalRecordLayout({ title, closeHref, background, children, supportsEditor = false }: {
  title: string; closeHref: string; background: ReactNode; children: ReactNode; supportsEditor?: boolean;
}) {
  return <CanonicalRecordPanel title={title} closeHref={closeHref} supportsEditor={supportsEditor}
    background={<Suspense fallback={<TableSkeleton columns={4} />}>{background}</Suspense>}>
    {children}
  </CanonicalRecordPanel>;
}
