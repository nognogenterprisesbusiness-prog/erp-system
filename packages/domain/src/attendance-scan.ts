import { z } from "zod";
import { uuidSchema } from "./common";

/** Worker ID cards carry only this random identifier; the ERP looks up the worker. */
export const workerCardPattern = /^NW-[A-F0-9]{32}$/;
export const isWorkerCard = (value: string) => workerCardPattern.test(value.trim().toUpperCase());

export const attendanceScanInputSchema = z.object({
  idempotencyKey: uuidSchema,
  projectId: uuidSchema,
  siteId: uuidSchema,
  card: z.string().trim().toUpperCase().regex(workerCardPattern, "This is not a worker ID card."),
});
export type AttendanceScanInput = z.input<typeof attendanceScanInputSchema>;

export const attendanceScanSummarySchema = z.object({
  employee_id: uuidSchema,
  name: z.string(),
  code: z.string(),
  assignment_id: uuidSchema,
  project_site_id: uuidSchema,
  work_date: z.string(),
  basis: z.enum(["hourly", "daily"]).nullable(),
  time_in: z.string().nullable(),
  time_out: z.string().nullable(),
  last_scan: z.enum(["in", "out"]),
  last_scanned_at: z.string(),
  hours: z.coerce.number().finite().min(0).max(24),
  recorded: z.boolean(),
});
export type AttendanceScanSummary = z.output<typeof attendanceScanSummarySchema>;
export const attendanceScanResultSchema = attendanceScanSummarySchema.extend({
  scan_type: z.enum(["in", "out"]),
  repeated: z.boolean(),
});
export const attendanceScanListSchema = z.object({ items: z.array(attendanceScanSummarySchema) });

export function scanClock(value: string) {
  return new Intl.DateTimeFormat("en-PH", { timeZone: "Asia/Manila", hour: "numeric", minute: "2-digit" }).format(new Date(value));
}

/**
 * Pre-fills one attendance entry from today's scans. Hours are the time between time-in and time-out,
 * including breaks; the Foreman reviews them before posting. Without a time-out the usual 8 hours stay.
 */
export function attendanceFromScan(scan: AttendanceScanSummary) {
  const scanned = scan.time_out !== null && scan.hours > 0;
  const hours = scanned ? String(Math.min(24, Math.round(scan.hours * 100) / 100)) : "8";
  const note = scan.time_in
    ? `QR in ${scanClock(scan.time_in)} · ${scan.time_out ? `out ${scanClock(scan.time_out)}` : "no time-out"}`
    : "Site attendance";
  return { hours, dayFraction: scan.basis === "daily" ? ("1" as const) : ("" as const), note, scanned };
}
