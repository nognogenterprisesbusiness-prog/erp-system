import type { ReactNode } from "react";
import ListPage from "@/app/(workspace)/purchase-orders/page";
import { CanonicalRecordLayout } from "@/components/ui/canonical-record-layout";

export default function RecordLayout({ children }: { children: ReactNode }) {
  return <CanonicalRecordLayout title="Purchase details" closeHref="/purchase-orders"
    background={<ListPage searchParams={Promise.resolve({})} />}>{children}</CanonicalRecordLayout>;
}
