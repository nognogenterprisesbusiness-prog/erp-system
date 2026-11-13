import type { ReactNode } from "react";
import ListPage from "@/app/(workspace)/reports/daily/page";
import { CanonicalRecordLayout } from "@/components/ui/canonical-record-layout";

export default function RecordLayout({ children }: { children: ReactNode }) {
  return <CanonicalRecordLayout supportsEditor title="Daily report" closeHref="/reports/daily"
    background={<ListPage searchParams={Promise.resolve({})} />}>{children}</CanonicalRecordLayout>;
}
