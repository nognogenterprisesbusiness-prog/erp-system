import type { ReactNode } from "react";
import ListPage from "@/app/(workspace)/purchase-orders/quotations/page";
import { CanonicalRecordLayout } from "@/components/ui/canonical-record-layout";

export default function RecordLayout({ children }: { children: ReactNode }) {
  return <CanonicalRecordLayout title="Supplier quotation" closeHref="/purchase-orders/quotations"
    background={<ListPage searchParams={Promise.resolve({})} />}>{children}</CanonicalRecordLayout>;
}
