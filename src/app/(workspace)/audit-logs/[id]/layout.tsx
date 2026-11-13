import type { ReactNode } from "react";
import ListPage from "@/app/(workspace)/audit-logs/page";
import { CanonicalRecordLayout } from "@/components/ui/canonical-record-layout";

export default function RecordLayout({ children }: { children: ReactNode }) {
  return <CanonicalRecordLayout title="Audit details" closeHref="/audit-logs"
    background={<ListPage searchParams={Promise.resolve({})} />}>{children}</CanonicalRecordLayout>;
}
