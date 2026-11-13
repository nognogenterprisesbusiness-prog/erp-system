import type { ReactNode } from "react";
import ListPage from "@/app/(workspace)/warehouses/page";
import { CanonicalRecordLayout } from "@/components/ui/canonical-record-layout";

export default function RecordLayout({ children }: { children: ReactNode }) {
  return <CanonicalRecordLayout supportsEditor title="Warehouse details" closeHref="/warehouses"
    background={<ListPage searchParams={Promise.resolve({})} />}>{children}</CanonicalRecordLayout>;
}
