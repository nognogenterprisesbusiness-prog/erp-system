import { redirect } from "next/navigation";
import { InventoryMovementForm } from "@/components/inventory/inventory-movement-form";
import { PageHeader } from "@/components/ui/page-header";
import { requireUser } from "@/lib/auth";
import { getInventoryOptions } from "@/lib/data/inventory";
export default async function StockOutPage() { const user = await requireUser(); if (!user.canManage) redirect("/inventory"); const options = await getInventoryOptions(); return <><PageHeader eyebrow="Inventory exception" title="Warehouse stock out" description="Administrator-only non-project write-off. For project use, transfer stock to the site and record its consumption. Enter a reference and reason." /><div className="mt-7"><InventoryMovementForm mode="stock-out" {...options} /></div></>; }
