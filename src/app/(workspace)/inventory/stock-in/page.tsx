import { redirect } from "next/navigation";
import { uuidSchema } from "@nognog/domain";
import { InventoryMovementForm } from "@/components/inventory/inventory-movement-form";
import { PageHeader } from "@/components/ui/page-header";
import { requireUser } from "@/lib/auth";
import { getInventoryOptions } from "@/lib/data/inventory";
export default async function StockInPage({ searchParams }: { searchParams: Promise<{ material?: string }> }) { const user = await requireUser(); if (!user.canManage) redirect("/inventory"); const options = await getInventoryOptions(); const parsed = uuidSchema.safeParse((await searchParams).material); return <><PageHeader eyebrow="Inventory transaction" title="Exception stock receipt" description="Use a purchase order for standard supplier deliveries. Record a reason and verified total value for a non-PO receipt." /><div className="mt-7"><InventoryMovementForm mode="stock-in" initialMaterialId={parsed.success ? parsed.data : ""} {...options} /></div></>; }
