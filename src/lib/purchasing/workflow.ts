import type { PurchaseLineRow } from "@/types/database";

type WorkflowPurchase = Pick<PurchaseLineRow, "source" | "delivery_stage" | "payment_stage">;
type Capabilities = { canManage: boolean; canViewFinance: boolean };
export type PurchaseWorkflowAction = "receive" | "payment" | "review" | "reimburse" | "history" | "view";

export function getPurchaseWorkflow(row: WorkflowPurchase, capabilities: Capabilities, paymentBalance: number | null) {
  const terminal = row.delivery_stage === "rejected" || row.delivery_stage === "cancelled";
  const label = terminal ? (row.delivery_stage === "rejected" ? "Rejected" : "Cancelled")
    : row.delivery_stage === "waiting_approval" ? "Approval"
    : row.delivery_stage === "received" ? (row.payment_stage === "to_reimburse" ? "Reimbursement" : "Supplier Payment")
    : row.delivery_stage === "partly_received" ? "Inventory Receipt" : "Purchase Order";
  let action: PurchaseWorkflowAction = "view";
  if (!terminal && row.source === "purchase_order") {
    if (capabilities.canManage && (row.delivery_stage === "ordered" || row.delivery_stage === "partly_received")) action = "receive";
    else if (capabilities.canViewFinance) action = paymentBalance !== null && paymentBalance > 0 ? "payment" : "history";
  } else if (!terminal && capabilities.canViewFinance) {
    if (row.delivery_stage === "waiting_approval") action = "review";
    else if (row.payment_stage === "to_reimburse") action = "reimburse";
    else action = "history";
  }
  return { label, action, terminal };
}
