import type { ReactNode } from "react";
import ListPage from "@/app/(workspace)/equipment/page";
import { CanonicalRecordLayout } from "@/components/ui/canonical-record-layout";

export default function RecordLayout({ children }: { children: ReactNode }) {
  return <CanonicalRecordLayout supportsEditor title="Equipment details" closeHref="/equipment"
    background={<ListPage searchParams={Promise.resolve({})} />}>{children}</CanonicalRecordLayout>;
}
