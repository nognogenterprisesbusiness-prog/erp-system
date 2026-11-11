/** Display guidance only. Server commands and RLS remain the authority for every transition. */
export const materialRequestStatuses = ["submitted", "approved", "partially_approved", "rejected", "cancelled"] as const;
export const materialRequestStatusLabels = { submitted: "For approval", approved: "Approved", partially_approved: "Partly approved", rejected: "Rejected", cancelled: "Cancelled" } as const;
export const deliveryStageLabels = { ready: "Ready to release", upcoming: "On the way", partial: "Partly received", received: "Received", settled: "Completed with loss / damage" } as const;
export type DeliveryStage = keyof typeof deliveryStageLabels;
type Tracking = { approved_quantity: number; reserved: number; dispatched: number; received: number; variance: number };

export function requestDeliveryStage(status: string, tracking: Tracking[]): DeliveryStage | null {
  if (!["approved", "partially_approved"].includes(status) || !tracking.length) return null;
  const units = (value: number) => Math.round(Number(value) * 10_000);
  const received = tracking.some(row => units(row.received) > 0);
  if (tracking.some(row => units(row.dispatched) > units(row.received) + units(row.variance))) return received ? "partial" : "upcoming";
  if (tracking.some(row => units(row.reserved) > 0)) return received ? "partial" : "ready";
  if (tracking.some(row => units(row.dispatched) > 0) && tracking.every(row => units(row.received) + units(row.variance) >= units(row.dispatched)))
    return tracking.some(row => units(row.variance) > 0) ? "settled" : "received";
  return received ? "partial" : null;
}

type RequestGuideAction = "review" | "source" | "receive" | "release" | null;
export type WorkflowGuide<Action extends string | null = null> = { title: string; detail: string; action: Action; actionLabel: string };
export function materialRequestGuide(context: {
  status: string; hasSource: boolean; ownRequest: boolean; canReview: boolean; canChooseSource: boolean;
  canRelease: boolean; canReceive: boolean; hasIncoming: boolean; hasReserved: boolean; deliveryStage?: string | null;
}): WorkflowGuide<RequestGuideAction> {
  const result = (title: string, detail: string, action: RequestGuideAction = null, actionLabel = "") => ({ title, detail, action, actionLabel });
  if (context.status === "rejected") return result("Request rejected", "No materials will be released for this request. Read the decision note before creating a new request.");
  if (context.status === "cancelled") return result("Request cancelled", "This request is closed. Its history remains available; any reserved stock has been released.");
  if (context.status === "submitted") {
    if (context.canReview) return result("Review requested materials", "Check quantities and available warehouse stock, then save your decision. Approval sets stock aside; it does not release it.", "review", "Review materials");
    if (!context.hasSource && context.canChooseSource) return result("Choose the source warehouse", "Choose the default source for review. Admin can also split materials across warehouses during approval.", "source", "Choose warehouse");
    if (!context.hasSource) return result("Waiting for stock allocation", "Admin can allocate materials across warehouses during approval. Warehouse Staff can choose a default source. Stock has not left the warehouse.");
    return result("Waiting for approval", context.ownRequest ? "Another authorized reviewer must approve your request. You cannot approve your own request." : "An authorized reviewer must approve quantities before the warehouse can release stock.");
  }
  if (!["approved", "partially_approved"].includes(context.status)) return result("Check request details", "Refresh this record to check its latest status. Contact Admin if the status is unfamiliar.");
  if (context.hasIncoming && context.canReceive) return result("Confirm what arrived", "Open the delivery and enter only what you counted and accepted at the site. Any shortage stays in transit.", "receive", "Receive delivery");
  if (context.hasReserved && context.canRelease) return result("Release approved stock", "Choose a material allocation and record the quantity leaving its warehouse, vehicle and driver.", "release", "Release stock");
  if (context.deliveryStage === "received" || context.deliveryStage === "settled") return result("Delivery accounted for", "Check delivery history for received quantities, approved loss or damage, and any remainder closed without delivery. Record actual use separately to charge project materials.");
  if (context.hasIncoming) return result("Materials are on the way", "Assigned site staff will confirm the quantity actually received. A warehouse release does not add site stock until receipt is recorded.");
  if (context.hasReserved) return result("Waiting for warehouse release", "Approved stock is set aside at its source warehouse. Warehouse Staff must record its release before delivery begins.");
  return result("Approval recorded", "Check material allocations and delivery history for the latest quantities. No new delivery is currently shown as pending.");
}

export const reportStatusLabels = { draft: "In progress", submitted: "For review", pending_review: "For review", approved: "Approved", rejected: "Rejected", requires_revision: "Needs correction" } as const;
export function dailyReportActions(status: string, own: boolean, canReview: boolean) {
  return { canEdit: own && status === "draft", canReview: !own && canReview && status === "submitted", canCorrect: own && status === "requires_revision" };
}
export function dailyReportGuide(status: string, own: boolean, canReview: boolean): WorkflowGuide<"edit" | "review" | "correct" | null> {
  if (status === "draft") return { title: "Report in progress", detail: own ? "Review today's activity, add your work notes, then submit the report for review." : "The author is still preparing this report.", action: own ? "edit" : null, actionLabel: own ? "Continue report" : "" };
  if (status === "submitted") return { title: "Report awaiting review", detail: canReview && !own ? "Check the report and its linked records. Approve it or return it with a clear correction note." : "An independent authorized reviewer checks this report. Linked stock, attendance and equipment entries remain recorded once.", action: canReview && !own ? "review" : null, actionLabel: canReview && !own ? "Review report" : "" };
  if (status === "requires_revision") return { title: "Report needs correction", detail: own ? "Read the review note and use the correction flow to prepare a new revision. Posted activity is retained." : "The author must address the review note and prepare a new revision.", action: own ? "correct" : null, actionLabel: own ? "Prepare correction" : "" };
  if (status === "pending_review" || status === "rejected") return { title: "Admin review needed", detail: "Read the review history and ask Admin to check this report before proceeding. Its recorded activity is retained.", action: null, actionLabel: "" };
  if (status === "approved") return { title: "Report approved", detail: "This reviewed report stays in history. Corrections use a new revision; they do not post its linked costs again.", action: null, actionLabel: "" };
  return { title: "Report status unavailable", detail: "Refresh the report before taking an action.", action: null, actionLabel: "" };
}

export const equipmentRequestGuides = {
  submitted: { label: "For approval", detail: "Admin reviews availability before this unit can be released." },
  approved: { label: "Ready for handover", detail: "Approved for this site. Admin must record the handover before the unit is considered checked out." },
  checked_out: { label: "Checked out to site", detail: "The handover is recorded. Log actual hours separately; Admin records its return." },
  returned: { label: "Returned", detail: "Return recorded. Previous usage and expenses stay in history." },
  rejected: { label: "Rejected", detail: "Read the decision note or contact Admin before requesting another unit." },
} as const;
