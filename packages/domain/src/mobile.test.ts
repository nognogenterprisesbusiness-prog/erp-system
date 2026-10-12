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
import { mobileBuildStatus } from "./mobile-compatibility";
test("released minimum builds apply per platform without forcing the web preview", () => {
  const policy = { minimumBuilds: { android: 7, ios: 2 } };
  assert.equal(mobileBuildStatus("android", 6, policy), "update_required");
  assert.equal(mobileBuildStatus("android", 7, policy), "compatible");
  assert.equal(mobileBuildStatus("ios", 1, policy), "update_required");
  assert.equal(mobileBuildStatus("ios", 2, policy), "compatible");
  assert.equal(mobileBuildStatus("web", null, policy), "compatible");
  assert.equal(mobileBuildStatus(null, null, policy), "compatible");
});
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
  assert.equal(mobileCommandSchema.safeParse({ action: "report-missing-material", input: { ...input, materialId: randomUUID() } }).success, true);
  assert.equal(mobileCommandSchema.safeParse({ action: "report-missing-material", input: { ...input, materialId: "cement" } }).success, false);
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

test("material history marks reversals without exposing costs", () => {
  const record = {
    id: randomUUID(), transaction_type: "MATERIAL_CONSUMPTION", transaction_date: "2026-09-30",
    name: "Cement", quantity: 4, unit: "bags", remarks: null, reversed: true, cost_total: 400,
  };
  const result = mobileResponseSchemas["inventory-history"].parse({ items: [record], count: 1, page: 1, pageSize: 20 });
  assert.equal(result.items[0].reversed, true);
  assert.equal("cost_total" in result.items[0], false);
  assert.equal(mobileResponseSchemas["inventory-history"].safeParse({ items: [{ ...record, reversed: undefined }], count: 1, page: 1, pageSize: 20 }).success, false);
});

test("request catalog retains zero-stock identities and quantity-only warehouse choices", () => {
  const material = {
    id: randomUUID(), code: "CEM-001", name: "Cement", unit_id: randomUUID(), unit: "bag",
    photo_path: null, available_quantity: 0,
    warehouses: [{ id: randomUUID(), name: "Main warehouse", available_quantity: 0, unit_price: 500 }],
    cost_total: 0,
  };
  const result = mobileResponseSchemas["request-catalog"].parse({ items: [material], count: 1, page: 1, pageSize: 20 });
  assert.equal(result.items[0].code, "CEM-001");
  assert.equal(result.items[0].name, "Cement");
  assert.equal(result.items[0].available_quantity, 0);
  assert.equal("cost_total" in result.items[0], false);
  assert.equal("unit_price" in result.items[0].warehouses[0], false);
});

test("history provenance supports mixed suppliers and strips prices from every source", () => {
  const record = {
    id: randomUUID(), transaction_type: "MATERIAL_CONSUMPTION", transaction_date: "2026-10-12",
    name: "Cement", quantity: 3, unit: "bag", remarks: null, reversed: false, direction: "Out",
    reference: "USE-001", location_name: null, request_id: null, site_purchase_id: null,
    sources: [
      { name: "City Hardware", reference: "PO-001", quantity: 2, cost_total: 200 },
      { name: "Other Hardware", reference: "SP-001", quantity: 1, unit_price: 120 },
    ],
  };
  const result = mobileResponseSchemas["inventory-history"].parse({ items: [record], count: 1, page: 1, pageSize: 20 });
  assert.deepEqual(result.items[0].sources, [
    { name: "City Hardware", reference: "PO-001", quantity: 2 },
    { name: "Other Hardware", reference: "SP-001", quantity: 1 },
  ]);
});

test("mobile requests allow server dates and later warehouse assignment while rejecting duplicate lines or incomplete legacy fields", () => {
  const input = { idempotencyKey: randomUUID(), projectId: randomUUID(), siteId: randomUUID(), purpose: "Footing work", lines: [{ materialId: randomUUID(), quantity: "3" }] };
  const parse = (data: unknown) => mobileCommandSchema.safeParse({ action: "request-materials", input: data });
  assert.equal(parse(input).success, true);
  assert.equal(parse({ ...input, lines: [...input.lines, ...input.lines] }).success, false);
  assert.equal(parse({ ...input, warehouseId: randomUUID() }).success, false);
  assert.equal(parse({ ...input, warehouseId: randomUUID(), requiredDate: "2026-10-12" }).success, true);
});
