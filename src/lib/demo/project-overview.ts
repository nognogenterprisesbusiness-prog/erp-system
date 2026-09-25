import type { DemoData } from "./schema";

const pesoFormatter = new Intl.NumberFormat("en-PH", { minimumFractionDigits: 2, maximumFractionDigits: 2 });

export function formatDemoCentavos(value: number): string {
  return `${value < 0 ? "-" : ""}₱${pesoFormatter.format(Math.abs(value) / 100)}`;
}

export function parseDemoProjectAmount(value: string, label: string): number | undefined {
  const trimmed = value.trim();
  if (!trimmed) return undefined;
  if (!/^(?:\d{1,11}|\d{1,3}(?:,\d{3}){1,3})(?:\.\d{1,2})?$/.test(trimmed)) throw new Error(`${label} must be a non-negative amount with at most two decimal places.`);
  const [whole, fraction = ""] = trimmed.replaceAll(",", "").split(".");
  const centavos = Number(whole) * 100 + Number(fraction.padEnd(2, "0"));
  if (!Number.isSafeInteger(centavos) || centavos > 1_000_000_000_000) throw new Error(`${label} is too large.`);
  return centavos;
}

export function demoProjectOverview(tables: DemoData, projectId: string) {
  const requestIds = new Set(tables.materialRequests.filter((request) => request.projectId === projectId).map((request) => request.id));
  const materialCostCentavos = tables.requestMovements.reduce((sum, movement) =>
    requestIds.has(movement.requestId) && movement.kind === "consumption" ? sum + (movement.amountCentavos ?? 0) : sum, 0);
  const reversedAttendanceIds = new Set(tables.attendanceReversals.map((item) => item.attendanceId));
  const laborCostCentavos = tables.attendance.reduce((sum, entry) => entry.projectId === projectId && !reversedAttendanceIds.has(entry.id) ? sum + (entry.costCentavos ?? 0) : sum, 0);
  const reports = tables.dailyReports.filter((report) => report.projectId === projectId).toSorted((a, b) => b.date.localeCompare(a.date) || b.id.localeCompare(a.id));
  const latestProgress = reports.find((report) => report.progressPercent !== undefined);
  return { materialCostCentavos, laborCostCentavos, reports, latestProgress };
}
