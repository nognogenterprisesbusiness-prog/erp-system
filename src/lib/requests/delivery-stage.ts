type Tracking = { approved_quantity: number; reserved: number; dispatched: number; received: number; variance: number };
export const requestDeliveryLabels = {
  ready: "Ready to release",
  upcoming: "On the way",
  partial: "Partly received",
  received: "Received",
  settled: "Completed with loss / damage",
} as const;

export function requestDeliveryStage(status: string, tracking: Tracking[]) {
  if (!["approved", "partially_approved"].includes(status) || !tracking.length) return null;
  // Compare each material in its own unit and the ledger's four-decimal precision.
  const units = (value: number) => Math.round(Number(value) * 10_000);
  const received = tracking.some((row) => units(row.received) > 0);
  if (tracking.some((row) => units(row.dispatched) > units(row.received) + units(row.variance))) return received ? "partial" as const : "upcoming" as const;
  if (tracking.some((row) => units(row.reserved) > 0)) return received ? "partial" as const : "ready" as const;
  // Once all reservations are released or used, only dispatched stock is still
  // due. Closing an undispatched remainder must not leave delivery pending.
  if (tracking.some((row) => units(row.dispatched) > 0) && tracking.every((row) => units(row.received) + units(row.variance) >= units(row.dispatched))) return tracking.some((row) => units(row.variance) > 0) ? "settled" as const : "received" as const;
  return received ? "partial" as const : null;
}
