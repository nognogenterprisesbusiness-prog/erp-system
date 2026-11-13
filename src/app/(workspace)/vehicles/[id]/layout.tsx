import type { ReactNode } from "react";
import ListPage from "@/app/(workspace)/vehicles/page";
import { CanonicalRecordLayout } from "@/components/ui/canonical-record-layout";

export default function RecordLayout({ children }: { children: ReactNode }) {
  return <CanonicalRecordLayout supportsEditor title="Vehicle details" closeHref="/vehicles"
    background={<ListPage searchParams={Promise.resolve({})} />}>{children}</CanonicalRecordLayout>;
}
