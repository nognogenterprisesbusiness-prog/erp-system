import { randomUUID } from "node:crypto";
import Link from "next/link";
import { IssuePurchaseOrderForm } from "@/components/purchase-orders/purchase-order-forms";
import { Button } from "@/components/ui/button";
import { EmptyState } from "@/components/ui/empty-state";
import { PageHeader } from "@/components/ui/page-header";
import { requireManager } from "@/lib/auth";
import { getPurchaseOrderChoices } from "@/lib/data/purchase-orders";

export default async function NewPurchaseOrderPage() {
  await requireManager();
  const choices = await getPurchaseOrderChoices();
  const today = new Intl.DateTimeFormat("sv-SE", { timeZone: "Asia/Manila", year: "numeric", month: "2-digit", day: "2-digit" }).format(new Date());
  return <><PageHeader title="New purchase order" description="Choose a supplier, receiving warehouse, and material lines." action={<Button variant="outline" asChild><Link href="/purchase-orders">Cancel</Link></Button>} /><div className="mt-7 max-w-5xl">{choices.suppliers.length && choices.warehouses.length ? <IssuePurchaseOrderForm choices={choices} idempotencyKey={randomUUID()} today={today} /> : <div className="rounded-xl border border-slate-200 bg-white"><EmptyState title="Supplier or warehouse missing" description="Create an active supplier and warehouse before issuing a purchase order." /></div>}</div></>;
}
