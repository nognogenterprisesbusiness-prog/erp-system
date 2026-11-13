import type { ReactNode } from "react";
import ListPage from "@/app/(workspace)/employees/page";
import { CanonicalRecordLayout } from "@/components/ui/canonical-record-layout";

export default function RecordLayout({ children }: { children: ReactNode }) {
  return <CanonicalRecordLayout supportsEditor title="Employee details" closeHref="/employees"
    background={<ListPage searchParams={Promise.resolve({})} />}>{children}</CanonicalRecordLayout>;
}
