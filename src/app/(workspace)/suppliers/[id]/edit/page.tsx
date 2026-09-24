import Link from "next/link";
import { SupplierForm } from "@/components/suppliers/supplier-form";
import { Button } from "@/components/ui/button";
import { PageHeader } from "@/components/ui/page-header";
import { requireManager } from "@/lib/auth";
import { getSupplier } from "@/lib/data/suppliers";

export default async function EditSupplierPage({ params }: { params: Promise<{ id: string }> }) {
  await requireManager(); const { id } = await params; const data = await getSupplier(id);
  return <><PageHeader eyebrow="Supplier registry" title={`Edit ${data.supplier.supplier_name}`} description="Validated updates preserve the supplier identity, catalog, price history, and audit trail." action={<Button variant="outline" asChild><Link href={`/suppliers/${id}`}>Cancel</Link></Button>} /><div className="mt-7 max-w-5xl"><SupplierForm supplier={data.supplier} categories={data.references.categories} /></div></>;
}
