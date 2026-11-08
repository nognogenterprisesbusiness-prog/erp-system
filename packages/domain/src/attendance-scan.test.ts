import assert from "node:assert/strict";
import { test } from "node:test";
import { attendanceBatchSchema } from "./mobile";
import { attendanceFromScan, attendanceScanInputSchema, attendanceScanResultSchema, isWorkerCard } from "./attendance-scan";

const card = `NW-${"A1".repeat(16)}`;
const scan = {
  employee_id: "00000000-0000-4000-8000-000000000001",
  name: "Juan Dela Cruz",
  code: "EMP-001",
  assignment_id: "00000000-0000-4000-8000-000000000002",
  project_site_id: "00000000-0000-4000-8000-000000000003",
  work_date: "2026-11-08",
  basis: "hourly" as const,
  time_in: "2026-11-07T23:02:00Z",
  time_out: "2026-11-08T09:10:00Z",
  last_scan: "out" as const,
  last_scanned_at: "2026-11-08T09:10:00Z",
  hours: 10.1333,
  recorded: false,
};

test("worker card codes are recognised and normalised; other QR codes are not", () => {
  assert.equal(isWorkerCard(card.toLowerCase()), true);
  assert.equal(isWorkerCard(`NQ-${"A".repeat(32)}`), false);
  const parsed = attendanceScanInputSchema.parse({ idempotencyKey: scan.employee_id, projectId: scan.assignment_id, siteId: scan.project_site_id, card: ` ${card.toLowerCase()} ` });
  assert.equal(parsed.card, card);
  assert.equal(attendanceScanInputSchema.safeParse({ ...parsed, card: "https://example.com" }).success, false);
});

test("scan results parse numeric hours from the database", () => {
  const parsed = attendanceScanResultSchema.parse({ ...scan, hours: "10.13", scan_type: "out", repeated: false });
  assert.equal(parsed.hours, 10.13);
});

test("time-in and time-out pre-fill hours and a note that the attendance batch accepts", () => {
  const filled = attendanceFromScan(scan);
  assert.equal(filled.hours, "10.13");
  assert.equal(filled.dayFraction, "");
  assert.match(filled.note, /^QR in 7:02\sAM · out 5:10\sPM$/);
  const batch = attendanceBatchSchema.safeParse({ projectId: scan.employee_id, siteId: scan.project_site_id, workDate: scan.work_date, entries: [{ idempotencyKey: scan.employee_id, assignmentId: scan.assignment_id, status: "present", ...filled }] });
  assert.equal(batch.success, true);
});

test("without a time-out the Foreman starts from 8 hours; daily workers default to a full day", () => {
  const filled = attendanceFromScan({ ...scan, basis: "daily", time_out: null, last_scan: "in", hours: 0 });
  assert.deepEqual({ hours: filled.hours, dayFraction: filled.dayFraction, scanned: filled.scanned }, { hours: "8", dayFraction: "1", scanned: false });
  assert.match(filled.note, /no time-out$/);
});
