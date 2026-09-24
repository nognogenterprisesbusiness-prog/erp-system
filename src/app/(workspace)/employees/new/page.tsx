import Link from "next/link";
import { EmployeeForm } from "@/components/workforce/employee-form";
import { Button } from "@/components/ui/button";
import { PageHeader } from "@/components/ui/page-header";
import { requireManager } from "@/lib/auth";
import { getWorkforceReferences } from "@/lib/data/workforce";

export default async function NewEmployeePage() {
  await requireManager();
  const references = await getWorkforceReferences();
  return <><PageHeader eyebrow="Employee registry" title="Register employee" description="Create a workforce identity. A login account is optional and does not replace project access assignments." action={<Button variant="outline" asChild><Link href="/employees">Cancel</Link></Button>} /><div className="mt-7 max-w-4xl"><EmployeeForm categories={references.categories} profiles={references.profiles} /></div></>;
}
