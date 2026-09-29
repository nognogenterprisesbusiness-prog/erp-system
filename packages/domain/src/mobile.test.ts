import assert from "node:assert/strict";
import { test } from "node:test";
import { randomUUID } from "node:crypto";
import {
  attendanceBatchSchema,
  mobileCommandSchema,
  mobileAccess,
  mobileQuerySchema,
  mobileResponseSchemas,
} from "./mobile";
test("mobile access requires an active onboarded site role and excludes administration", () => {
  assert.equal(mobileAccess(["foreman"], true, false), true);
  assert.equal(mobileAccess(["engineer"], true, false), true);
  for (const roles of [
    [],
    ["warehouse_staff"],
    ["admin"],
    ["admin", "engineer"],
  ])
    assert.equal(mobileAccess(roles, true, false), false);
  assert.equal(mobileAccess(["foreman"], false, false), false);
  assert.equal(mobileAccess(["foreman"], true, true), false);
});
test("attendance rejects duplicate workers, invalid hours and nonzero absence", () => {
  const worker = {
    idempotencyKey: randomUUID(),
    assignmentId: randomUUID(),
    status: "present",
    hours: "8",
    dayFraction: "1",
    note: "Site attendance",
  };
  const batch = {
    projectId: randomUUID(),
    siteId: randomUUID(),
    workDate: "2026-09-28",
    entries: [worker],
  };
  assert.equal(attendanceBatchSchema.safeParse(batch).success, true);
  assert.equal(
    attendanceBatchSchema.safeParse({ ...batch, entries: [worker, worker] })
      .success,
    false,
  );
  for (const hours of ["0", "25", "-1", "8.123"])
    assert.equal(
      attendanceBatchSchema.safeParse({
        ...batch,
        entries: [{ ...worker, hours }],
      }).success,
      false,
    );
  assert.equal(
    attendanceBatchSchema.safeParse({
      ...batch,
      entries: [{ ...worker, status: "absent" }],
    }).success,
    false,
  );
});
test("API pagination and identifiers are bounded and commands cannot set arbitrary status", () => {
  for (const page of ["0", "-1", "10001", "bad"])
    assert.equal(mobileQuerySchema.safeParse({ page }).success, false);
  assert.equal(
    mobileQuerySchema.safeParse({ projectId: "not-an-id" }).success,
    false,
  );
  assert.equal(mobileQuerySchema.safeParse({ transactionType: "MATERIAL_CONSUMPTION" }).success, true);
  assert.equal(mobileQuerySchema.safeParse({ transactionType: "STOCK_IN" }).success, false);
  assert.equal(
    mobileCommandSchema.safeParse({
      action: "update-status",
      input: { status: "approved" },
    }).success,
    false,
  );
});
test("missing material reports accept a scoped request and reject malformed quantities", () => {
  const input = {
    key: randomUUID(), projectId: randomUUID(), siteId: randomUUID(), warehouseId: randomUUID(),
    name: "Cement", unit: "bag", quantity: "12.5000", neededOn: "2026-10-01",
    reason: "Not available in the source warehouse",
  };
  assert.equal(mobileCommandSchema.safeParse({ action: "report-missing-material", input }).success, true);
  for (const quantity of ["0", "-1", "1.12345", "1000000001"])
    assert.equal(mobileCommandSchema.safeParse({ action: "report-missing-material", input: { ...input, quantity } }).success, false);
});
test("operational responses strip accidental wage and cost fields", () => {
  const result = mobileResponseSchemas.attendance.parse({
    items: [
      {
        id: randomUUID(),
        employee_id: randomUUID(),
        name: "Worker",
        project_site_id: randomUUID(),
        work_date: "2026-09-28",
        attendance_status: "present",
        hours_worked: 8,
        note: "Site attendance",
        reversed: false,
        rate_snapshot: 750,
        cost_total: 750,
      },
    ],
    count: 1,
    page: 1,
    pageSize: 20,
  });
  assert.equal("rate_snapshot" in result.items[0], false);
  assert.equal("cost_total" in result.items[0], false);
});
