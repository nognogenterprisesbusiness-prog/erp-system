import { quantityToMilli, milliToQuantity, type DemoData } from "./schema";

export type ActiveDemoRequest = Extract<DemoData["materialRequests"][number], { legacy: false }>;

export function summarizeDemoMovements(request: ActiveDemoRequest, movements: DemoData["requestMovements"]) {
  const sum = (kind: "dispatch" | "receipt" | "consumption") => movements.filter((row) => row.kind === kind).reduce((total, row) => total + quantityToMilli(row.quantity), 0);
  const dispatchedMilli = sum("dispatch");
  const receivedMilli = sum("receipt");
  const consumedMilli = sum("consumption");
  return {
    dispatched: milliToQuantity(dispatchedMilli),
    received: milliToQuantity(receivedMilli),
    consumed: milliToQuantity(consumedMilli),
    toDispatch: milliToQuantity(quantityToMilli(request.approvedQuantity) - dispatchedMilli),
    inTransit: milliToQuantity(dispatchedMilli - receivedMilli),
    atSite: milliToQuantity(receivedMilli - consumedMilli),
    costCentavos: movements.filter((row) => row.kind === "consumption").reduce((total, row) => total + (row.amountCentavos ?? 0), 0),
  };
}

export function demoRequestProgress(tables: DemoData, request: ActiveDemoRequest) {
  return summarizeDemoMovements(request, tables.requestMovements.filter((row) => row.requestId === request.id));
}

export function demoRequestStatusLabel(request: ActiveDemoRequest, progress: ReturnType<typeof demoRequestProgress>): string {
  if (request.status === "rejected") return "Rejected";
  if (request.status === "submitted") return "For approval";
  if (progress.inTransit > 0) return "In transit";
  if (progress.atSite > 0) return "At site";
  if (progress.toDispatch === 0 && progress.consumed > 0) return "Used";
  if (progress.dispatched > 0) return "Dispatched";
  return "Approved";
}
