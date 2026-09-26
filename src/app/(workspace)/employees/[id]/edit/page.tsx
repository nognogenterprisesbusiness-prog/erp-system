import { IntentLink as Link } from "@/components/layout/intent-link";
import { EmployeeForm } from "@/components/workforce/employee-form";
import { Button } from "@/components/ui/button";
import { PageHeader } from "@/components/ui/page-header";
import { requireManager } from "@/lib/auth";
import { getEmployee } from "@/lib/data/workforce";

export default async function EditEmployeePage({ params }: { params: Promise<{ id: string }> }) {
  await requireManager();
  const { id } = await params;
  const data = await getEmployee(id);
  return <><PageHeader eyebrow="Employee registry" title={`Edit ${data.employee.fullName}`} description="Validated updates keep the workforce identity and history intact." action={<Button variant="outline" asChild><Link href={`/employees/${id}`}>Cancel</Link></Button>} /><div className="mt-7 max-w-4xl"><EmployeeForm employee={data.employee} contact={data.contact} categories={data.references.categories} profiles={data.references.profiles} /></div></>;
}
