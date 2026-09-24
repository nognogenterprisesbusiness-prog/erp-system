import Link from "next/link";
import { SupplierForm } from "@/components/suppliers/supplier-form";
import { Button } from "@/components/ui/button";
import { PageHeader } from "@/components/ui/page-header";
import { requireManager } from "@/lib/auth";
import { getSupplierReferences } from "@/lib/data/suppliers";

export default async function NewSupplierPage() {
  await requireManager();
  const references = await getSupplierReferences();
  return <><PageHeader eyebrow="Supplier registry" title="Register supplier" description="Create one supplier identity; materials and prices are added after registration." action={<Button variant="outline" asChild><Link href="/suppliers">Cancel</Link></Button>} /><div className="mt-7 max-w-5xl"><SupplierForm categories={references.categories} /></div></>;
}
