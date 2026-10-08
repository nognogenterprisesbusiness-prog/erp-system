import { randomUUID } from "node:crypto";
import { PencilEdit02Icon, ViewIcon } from "@hugeicons/core-free-icons";
import { HugeiconsIcon } from "@hugeicons/react";
import { IntentLink as Link } from "@/components/layout/intent-link";
import { Button } from "@/components/ui/button";
import { RecordCreateDialog } from "@/components/ui/record-create-dialog";
import { RecordSupplierPaymentForm } from "./purchase-order-forms";
import { getPurchaseWorkflow } from "@/lib/purchasing/workflow";
import type { PurchaseLineRow } from "@/types/database";

const deliveryLabels = { waiting_approval: "Waiting approval", ordered: "Awaiting delivery", partly_received: "Partly received", received: "Received", rejected: "Rejected", cancelled: "Cancelled" } as const;
const paymentLabels = { unpaid: "Unpaid", partly_paid: "Partly paid", paid: "Paid", to_reimburse: "To reimburse", none: "" } as const;

export function PurchaseWorkflowCell({ row, canManage, canViewFinance, paymentBalance, today }: { row: PurchaseLineRow; canManage: boolean; canViewFinance: boolean; paymentBalance: number | null; today: string }) {
  const workflow = getPurchaseWorkflow(row, { canManage, canViewFinance }, paymentBalance);
  const href = row.source === "purchase_order" ? `/purchase-orders/${row.purchase_id}` : `/site-purchases/${row.purchase_id}`;
  const pencil = <HugeiconsIcon icon={PencilEdit02Icon} size={17} aria-hidden="true" />;
  const context = `${row.purchase_number} · ${row.supplier_name}`;
  const statuses = [deliveryLabels[row.delivery_stage], paymentLabels[row.payment_stage]].filter(Boolean).join(" · ");
  const tone = workflow.terminal ? "bg-slate-100 text-slate-600" : row.delivery_stage === "received" ? "bg-emerald-50 text-emerald-700" : row.delivery_stage === "waiting_approval" ? "bg-amber-50 text-amber-800" : "bg-sky-50 text-sky-800";
  let control: React.ReactNode;
  if (workflow.action === "payment" && paymentBalance !== null) {
    control = <RecordCreateDialog key={`${row.line_id}:${paymentBalance}`} title="Supplier Payment" triggerLabel="" triggerVariant="outline" triggerSize="icon" triggerIcon={pencil} triggerAriaLabel={`Manage Supplier Payment for ${context}`}>
      <p className="mb-4 text-sm text-slate-600">{context}. This payment covers the whole purchase, across all its items.</p>
      <RecordSupplierPaymentForm orderId={row.purchase_id} balance={paymentBalance} idempotencyKey={randomUUID()} today={today} />
    </RecordCreateDialog>;
  } else if (workflow.action === "receive") {
    control = <Button size="icon" variant="outline" asChild><Link href={`${href}#delivery-inspection`} aria-label={`Inspect delivery for ${context}`} title={`Inspect delivery for ${context}`}>{pencil}</Link></Button>;
  } else {
    const target = workflow.action === "reimburse" ? `${href}?action=reimburse` : workflow.action === "history" && row.source === "purchase_order" ? `${href}#supplier-payments` : href;
    const label = workflow.action === "review" ? "Review purchase and receipt" : workflow.action === "reimburse" ? "Manage reimbursement" : workflow.action === "history" ? "Manage Supplier Payment history" : "View purchase";
    control = <Button size="icon" variant="outline" asChild><Link href={target} aria-label={`${label} for ${context}`} title={`${label} for ${context}`}>{workflow.action === "view" ? <HugeiconsIcon icon={ViewIcon} size={17} aria-hidden="true" /> : pencil}</Link></Button>;
  }
  return <div className="flex items-center gap-3"><div className="min-w-0"><span className={`inline-flex rounded-full px-2.5 py-1 text-xs font-semibold ${tone}`}>{workflow.label}</span><p className="mt-1 text-xs text-slate-500">{statuses}</p></div>{control}</div>;
}
