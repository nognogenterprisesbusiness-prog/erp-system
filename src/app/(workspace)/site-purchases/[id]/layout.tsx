import type { ReactNode } from "react";
import ListPage from "@/app/(workspace)/site-purchases/page";
import ProjectsPage from "@/app/(workspace)/projects/page";
import { requireUser } from "@/lib/auth";
import { CanonicalRecordLayout } from "@/components/ui/canonical-record-layout";

export default async function RecordLayout({ children }: { children: ReactNode }) {
  const user = await requireUser();
  const canList = user.canViewLaborRates || user.roles.includes("engineer");
  return <CanonicalRecordLayout title="Site purchase" closeHref={canList ? "/site-purchases" : "/projects"}
    background={canList ? <ListPage searchParams={Promise.resolve({})} /> : <ProjectsPage searchParams={Promise.resolve({})} />}>{children}</CanonicalRecordLayout>;
}
