type Tracking = { approved_quantity: number; reserved: number; dispatched: number; received: number; variance: number };
export function requestDeliveryStage(status: string, tracking: Tracking[]) {
  if (!["approved", "partially_approved"].includes(status) || !tracking.length) return null;
  // Compare each material in its own unit and the ledger's four-decimal precision.
  const units = (value: number) => Math.round(Number(value) * 10_000);
  const received = tracking.some((row) => units(row.received) > 0);
  if (tracking.some((row) => units(row.dispatched) > units(row.received) + units(row.variance))) return received ? "partial" as const : "upcoming" as const;
  if (tracking.some((row) => units(row.reserved) > 0)) return received ? "partial" as const : "ready" as const;
  if (tracking.some((row) => units(row.approved_quantity) > 0) && tracking.every((row) => units(row.received) + units(row.variance) >= units(row.approved_quantity))) return tracking.some((row) => units(row.variance) > 0) ? "settled" as const : "received" as const;
  return received ? "partial" as const : null;
}
