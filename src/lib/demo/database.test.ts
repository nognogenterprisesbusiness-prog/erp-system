import "fake-indexeddb/auto";

import assert from "node:assert/strict";
import { afterEach, test } from "node:test";

import { runtimeConfig } from "../app-mode";
import { getSupabaseEnv } from "../supabase/env";
import { DemoDatabase, assignDemoEmployee, assignDemoWarehouse, checkoutDemoEquipmentRequest, consumeDemoMaterialRequest, decideDemoEquipmentRequest, decideDemoMaterialRequest, deleteDemoMaterialPlan, deleteDemoRecord, dispatchDemoMaterialRequest, endDemoEmployeeAssignment, exportDemo, generateDemoQr, getSavedSnapshotInfo, importDemo, initializeDemo, markDemoNotificationRead, markDemoNotificationsUnread, postDemoAttendance, readDemo, receiveDemoMaterialRequest, recordDemoStockIn, recordDemoSupplierPrice, registerDemoDailyReport, registerDemoEmployee, registerDemoEquipment, registerDemoMaterial, registerDemoProject, registerDemoSupplier, registerDemoUser, registerDemoWarehouse, resetDemo, restoreDemoSnapshot, returnDemoEquipmentRequest, reverseDemoAttendance, saveDemoMaterialPlan, saveDemoSnapshot, selectDemoUser, setDemoUserActive, submitDemoEquipmentRequest, submitDemoMaterialRequest, updateDemoEmployeePhoto, updateDemoProfile, updateDemoRecord } from "./database";
import { demoMaterialPlanSummary } from "./material-plan";
import { demoProjectOverview, parseDemoProjectAmount } from "./project-overview";
import { createDemoSeed } from "./seed";
import { DEMO_SCHEMA_VERSION } from "./schema";
import { searchDemo } from "./search";
import { visibleDemoEquipmentLocations, visibleDemoProjectIds, visibleDemoWarehouseIds } from "./visibility";
import { demoRequestProgress, demoRequestStatusLabel } from "./workflow";

const databases: DemoDatabase[] = [];
function database() {
  const db = new DemoDatabase(`nognog_erp_demo_test_${crypto.randomUUID()}`);
  databases.push(db);
  return db;
}

afterEach(async () => {
  const names = new Set(databases.map((db) => db.name));
  for (const db of databases.splice(0)) db.close();
  for (const name of names) {
    const db = new DemoDatabase(name);
    db.close();
    await db.delete();
  }
});

test("runtime mode selects local storage and disables external effects", () => {
  assert.deepEqual(runtimeConfig("local-demo"), {
    mode: "local-demo", dataProvider: "indexeddb", authentication: "demo-role", externalEffects: false,
  });
  assert.equal(runtimeConfig("staging").dataProvider, "supabase");
});

test("Supabase config never falls back from staging or demo to production", () => {
  const previous = {
    APP_MODE: process.env.APP_MODE,
    NEXT_PUBLIC_APP_MODE: process.env.NEXT_PUBLIC_APP_MODE,
    NEXT_PUBLIC_SUPABASE_URL: process.env.NEXT_PUBLIC_SUPABASE_URL,
    NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY: process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY,
    NEXT_PUBLIC_STAGING_SUPABASE_URL: process.env.NEXT_PUBLIC_STAGING_SUPABASE_URL,
    NEXT_PUBLIC_STAGING_SUPABASE_PUBLISHABLE_KEY: process.env.NEXT_PUBLIC_STAGING_SUPABASE_PUBLISHABLE_KEY,
  };
  try {
    process.env.APP_MODE = "staging";
    process.env.NEXT_PUBLIC_APP_MODE = "staging";
    process.env.NEXT_PUBLIC_SUPABASE_URL = "https://production.example";
    process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY = "production-key";
    delete process.env.NEXT_PUBLIC_STAGING_SUPABASE_URL;
    delete process.env.NEXT_PUBLIC_STAGING_SUPABASE_PUBLISHABLE_KEY;
    assert.throws(getSupabaseEnv, /staging/);
    process.env.APP_MODE = "local-demo";
    process.env.NEXT_PUBLIC_APP_MODE = "local-demo";
    assert.throws(getSupabaseEnv, /disabled/);
  } finally {
    for (const [key, value] of Object.entries(previous)) {
      if (value === undefined) delete process.env[key];
      else process.env[key] = value;
    }
  }
});

test("seed is created once and role choice survives database reopen", async () => {
  const first = database();
  await initializeDemo(first);
  assert.equal((await readDemo(first)).snapshot.tables.projects.length, 2);
  await selectDemoUser(first, "demo-user-foreman");
  await first.table("projects").put({ id: "demo-project-added", code: "DEMO-003", name: "Local project", status: "active", location: "Cebu" });
  first.close();
  const reopened = new DemoDatabase(first.name);
  databases.push(reopened);
  await initializeDemo(reopened);
  const result = await readDemo(reopened);
  assert.equal(result.selectedUserId, "demo-user-foreman");
  assert.equal(result.snapshot.tables.projects.length, 3);
});

test("attendance snapshots daily rates, blocks duplicate and excessive hours, and reverses without erasing history", async () => {
  const db = database();
  await readDemo(db);
  const assignmentId = "demo-employee-assignment-mason";
  const first = { assignmentId, date: "2026-09-02", status: "present" as const, hoursWorked: 8, paidDayBasisPoints: 5000, note: "Foundation work" };
  await postDemoAttendance(db, first);
  await assert.rejects(postDemoAttendance(db, first), /already has attendance/);
  let tables = (await readDemo(db)).snapshot.tables;
  const entry = tables.attendance.find((row) => row.date === first.date && row.employeeId === "demo-employee-mason");
  assert.ok(entry);
  assert.equal(entry.rateSnapshotCentavos, 45000);
  assert.equal(entry.costCentavos, 22500);
  await updateDemoRecord(db, "employees", "demo-employee-mason", { dailyWageCentavos: 60000 });
  tables = (await readDemo(db)).snapshot.tables;
  assert.equal(tables.attendance.find((row) => row.id === entry.id)?.costCentavos, 22500);
  await reverseDemoAttendance(db, entry.id, "Correcting recorded hours");
  await assert.rejects(reverseDemoAttendance(db, entry.id, "Again"), /already reversed/);
  await postDemoAttendance(db, { ...first, hoursWorked: 6, paidDayBasisPoints: 10000 });
  tables = (await readDemo(db)).snapshot.tables;
  assert.equal(tables.attendance.filter((row) => row.date === first.date).length, 2);
  assert.equal(tables.attendance.find((row) => row.date === first.date && row.id !== entry.id)?.costCentavos, 60000);
  assert.equal(tables.attendanceReversals.find((row) => row.attendanceId === entry.id)?.reason, "Correcting recorded hours");
  assert.equal(demoProjectOverview(tables, "demo-project-residential").laborCostCentavos, 45000 + 60000);
});

test("attendance requires manager posting and an effective assignment; hours cannot exceed 24 across projects", async () => {
  const db = database();
  await readDemo(db);
  await selectDemoUser(db, "demo-user-foreman");
  await assert.rejects(postDemoAttendance(db, { assignmentId: "demo-employee-assignment-mason", date: "2026-09-03", status: "present", hoursWorked: 8, paidDayBasisPoints: 10000, note: "Site work" }), /Only a manager/);
  await assert.rejects(assignDemoEmployee(db, { employeeId: "demo-employee-mason", projectId: "demo-project-commercial", siteId: "demo-site-commercial", startDate: "2026-09-01" }), /Only a manager/);
  await selectDemoUser(db, "demo-user-admin");
  await assert.rejects(assignDemoEmployee(db, { employeeId: "demo-employee-mason", projectId: "demo-project-residential", siteId: "demo-site-commercial", startDate: "2026-09-01" }), /active project site/);
  await assignDemoEmployee(db, { employeeId: "demo-employee-mason", projectId: "demo-project-commercial", siteId: "demo-site-commercial", startDate: "2026-09-02" });
  const assignment = (await readDemo(db)).snapshot.tables.employeeAssignments.find((row) => row.employeeId === "demo-employee-mason" && row.projectId === "demo-project-commercial");
  assert.ok(assignment);
  await assert.rejects(postDemoAttendance(db, { assignmentId: assignment.id, date: "2026-09-01", status: "present", hoursWorked: 8, paidDayBasisPoints: 10000, note: "Too early" }), /assigned to an active project/);
  await postDemoAttendance(db, { assignmentId: "demo-employee-assignment-mason", date: "2026-09-03", status: "present", hoursWorked: 16, paidDayBasisPoints: 10000, note: "First site" });
  await assert.rejects(postDemoAttendance(db, { assignmentId: assignment.id, date: "2026-09-03", status: "present", hoursWorked: 9, paidDayBasisPoints: 10000, note: "Second site" }), /more than 24/);
  await postDemoAttendance(db, { assignmentId: assignment.id, date: "2026-09-03", status: "present", hoursWorked: 8, paidDayBasisPoints: 10000, note: "Second site" });
  await assert.rejects(endDemoEmployeeAssignment(db, assignment.id, "2026-09-02"), /Attendance exists after/);
});

test("legacy attendance stays uncosted and can be reversed to allow a corrected entry", async () => {
  const db = database();
  await readDemo(db);
  await db.table("attendance").put({ id: "demo-attendance-legacy-extra", employeeId: "demo-employee-mason", projectId: "demo-project-residential", date: "2026-09-04", status: "present" });
  await reverseDemoAttendance(db, "demo-attendance-legacy-extra", "Replaced missing hours");
  await postDemoAttendance(db, { assignmentId: "demo-employee-assignment-mason", date: "2026-09-04", status: "present", hoursWorked: 8, paidDayBasisPoints: 10000, note: "Corrected work day" });
  const tables = (await readDemo(db)).snapshot.tables;
  assert.equal(tables.attendance.filter((row) => row.date === "2026-09-04").length, 2);
  assert.equal(tables.attendance.find((row) => row.id === "demo-attendance-legacy-extra")?.costCentavos, undefined);
  assert.equal(tables.attendanceReversals.length, 1);
});

test("version-seven demo imports preserve attendance without inventing historical labor cost", async () => {
  const db = database();
  await readDemo(db);
  const old = createDemoSeed();
  const payload = { ...old, schemaVersion: 7, tables: { ...old.tables, attendance: old.tables.attendance.map((entry) => ({ id: entry.id, employeeId: entry.employeeId, projectId: entry.projectId, date: entry.date, status: entry.status })) } };
  await importDemo(db, JSON.stringify(payload));
  const tables = (await readDemo(db)).snapshot.tables;
  assert.equal(tables.attendance.length, 1);
  assert.equal(tables.attendance[0].costCentavos, undefined);
  assert.equal(tables.employeeAssignments.length, 0);
});

test("warehouse creation is manager-only and new locations persist in inventory snapshots", async () => {
  const db = database();
  await readDemo(db);
  await registerDemoWarehouse(db, { name: "South Depot", location: "Mandaue" });
  await assert.rejects(registerDemoWarehouse(db, { name: "south depot", location: "Cebu" }), /already exists/);
  const created = (await readDemo(db)).snapshot.tables.warehouses.find((row) => row.name === "South Depot");
  assert.ok(created);
  await registerDemoMaterial(db, { code: "NEW-001", name: "Demo blocks", unit: "pieces", warehouseId: created.id, quantity: 20 });
  const data = (await readDemo(db)).snapshot.tables;
  assert.equal(data.balances.find((row) => row.warehouseId === created.id)?.quantity, 20);
  await selectDemoUser(db, "demo-user-foreman");
  await assert.rejects(registerDemoWarehouse(db, { name: "Denied Depot", location: "Cebu" }), /cannot make that change/);
});

test("project and warehouse photos belong to records and require a manager to change", async () => {
  const db = database();
  await readDemo(db);
  await registerDemoProject(db, { code: "PHOTO-1", name: "Photo Project", location: "Cebu", siteName: "Photo Site", status: "active", photo: "/demo-residential.webp" });
  await registerDemoWarehouse(db, { name: "Photo Depot", location: "Cebu", photo: "/demo-commercial.webp" });
  const tables = (await readDemo(db)).snapshot.tables;
  const project = tables.projects.find((row) => row.code === "PHOTO-1");
  const warehouse = tables.warehouses.find((row) => row.name === "Photo Depot");
  assert.ok(project && warehouse);
  assert.equal(project.photo, "/demo-residential.webp");
  assert.equal(warehouse.photo, "/demo-commercial.webp");
  await updateDemoRecord(db, "projects", project.id, { photo: "/demo-commercial.webp" });
  assert.equal((await readDemo(db)).snapshot.tables.projects.find((row) => row.id === project.id)?.photo, "/demo-commercial.webp");
  await assert.rejects(updateDemoRecord(db, "warehouses", warehouse.id, { photo: "javascript:alert(1)" }), /Invalid input|invalid_string|regex/i);
  await selectDemoUser(db, "demo-user-foreman");
  await assert.rejects(updateDemoRecord(db, "warehouses", warehouse.id, { photo: "/demo-commercial.webp" }), /cannot make that change/);
});

test("manager can edit master data but cannot erase linked stock or project history", async () => {
  const db = database();
  await readDemo(db);
  await updateDemoRecord(db, "warehouses", "demo-warehouse-main", { name: "Central Depot" });
  let tables = (await readDemo(db)).snapshot.tables;
  assert.equal(tables.equipment.find((row) => row.id === "demo-equipment-mixer")?.location, "Central Depot");
  await assert.rejects(deleteDemoRecord(db, "warehouses", "demo-warehouse-main"), /cannot be deleted/);
  await assert.rejects(deleteDemoRecord(db, "projects", "demo-project-residential"), /cannot be deleted/);
  await assert.rejects(deleteDemoRecord(db, "materials", "demo-material-cement"), /cannot be deleted/);
  await registerDemoWarehouse(db, { name: "Empty Depot", location: "Cebu" });
  await registerDemoMaterial(db, { code: "NEW-EMPTY", name: "Unused material", unit: "pieces", warehouseId: "demo-warehouse-main", quantity: 0 });
  tables = (await readDemo(db)).snapshot.tables;
  const emptyWarehouse = tables.warehouses.find((row) => row.name === "Empty Depot");
  const unusedMaterial = tables.materials.find((row) => row.code === "NEW-EMPTY");
  assert.ok(emptyWarehouse && unusedMaterial);
  await deleteDemoRecord(db, "materials", unusedMaterial.id);
  await deleteDemoRecord(db, "warehouses", emptyWarehouse.id);
  tables = (await readDemo(db)).snapshot.tables;
  assert.ok(!tables.materials.some((row) => row.id === unusedMaterial.id));
  assert.ok(!tables.balances.some((row) => row.materialId === unusedMaterial.id));
  await selectDemoUser(db, "demo-user-foreman");
  await assert.rejects(updateDemoRecord(db, "warehouses", "demo-warehouse-main", { name: "Forbidden" }), /cannot make that change/);
  await assert.rejects(deleteDemoRecord(db, "suppliers", "demo-supplier-hardware"), /cannot make that change/);
});

test("search exposes only pages, actions and records available to the preview role", async () => {
  const db = database();
  const tables = (await readDemo(db)).snapshot.tables;
  assert.ok(searchDemo(tables, "admin", "add warehouse").some((item) => item.href === "/demo?view=warehouses&action=add"));
  assert.ok(searchDemo(tables, "admin", "inventory").some((item) => item.type === "Page" && item.href === "/demo?view=inventory"));
  assert.ok(searchDemo(tables, "worker", "warehouse").every((item) => item.type === "Guide"));
  assert.ok(searchDemo(tables, "warehouse_staff", "stock in").some((item) => item.type === "Action"));
  assert.ok(!searchDemo(tables, "foreman", "supplier").some((item) => item.type === "Record"));
  assert.ok(searchDemo(tables, "foreman", "residential", "demo-user-foreman").some((item) => item.type === "Record"));
  assert.ok(!searchDemo(tables, "foreman", "commercial", "demo-user-foreman").some((item) => item.type === "Record"));
  await registerDemoWarehouse(db, { name: "Unassigned Depot", location: "Cebu" });
  const unassignedId = (await readDemo(db)).snapshot.tables.warehouses.find((row) => row.name === "Unassigned Depot")!.id;
  await registerDemoMaterial(db, { code: "PRIVATE-1", name: "Restricted aggregate", unit: "bags", warehouseId: unassignedId, quantity: 4 });
  const updated = (await readDemo(db)).snapshot.tables;
  assert.ok(!searchDemo(updated, "warehouse_staff", "Restricted aggregate", "demo-user-warehouse").some((item) => item.type === "Record"));
  assert.deepEqual([...visibleDemoProjectIds(tables, "foreman", "demo-user-foreman")], ["demo-project-residential"]);
  assert.ok(visibleDemoWarehouseIds(tables, "warehouse_staff", "demo-user-warehouse").has("demo-warehouse-main"));
  assert.ok(!visibleDemoEquipmentLocations(tables, "foreman", "demo-user-foreman").has("Commercial Building B Site"));
});

test("manager can create project, supplier and report while another role cannot", async () => {
  const db = database();
  await readDemo(db);
  await registerDemoProject(db, { code: "DEMO-003", name: "Clinic Extension", location: "Cebu", siteName: "Clinic Site", status: "active" });
  const created = (await readDemo(db)).snapshot.tables.projects.find((row) => row.code === "DEMO-003");
  assert.ok(created);
  assert.ok((await readDemo(db)).snapshot.tables.sites.some((row) => row.projectId === created.id));
  await assert.rejects(registerDemoProject(db, { code: "demo-003", name: "Duplicate", location: "Cebu", siteName: "Other", status: "active" }), /already exists/);
  await registerDemoSupplier(db, { name: "Demo Lumber Co", category: "Timber" });
  await registerDemoEmployee(db, { name: "Demo Installer", trade: "Carpentry", dailyWageCentavos: 50_000 });
  assert.equal((await readDemo(db)).snapshot.tables.employees.find((row) => row.name === "Demo Installer")?.dailyWageCentavos, 50_000);
  await assert.rejects(registerDemoEmployee(db, { name: "Invalid Wage", trade: "Carpentry", dailyWageCentavos: -1 }));
  await registerDemoDailyReport(db, { projectId: created.id, date: "2026-09-23", summary: "Site marked for excavation." });
  assert.ok((await readDemo(db)).snapshot.tables.dailyReports.some((row) => row.projectId === created.id));
  await assert.rejects(registerDemoDailyReport(db, { projectId: "demo-project-missing", date: "2026-09-23", summary: "Invalid" }), /existing project/);
  await selectDemoUser(db, "demo-user-foreman");
  await assert.rejects(registerDemoSupplier(db, { name: "Denied", category: "Timber" }), /cannot make that change/);
  await assert.rejects(registerDemoEmployee(db, { name: "Denied", trade: "Masonry" }), /cannot make that change/);
  await registerDemoDailyReport(db, { projectId: "demo-project-residential", date: "2026-09-24", summary: "Assigned site update." });
  await assert.rejects(registerDemoDailyReport(db, { projectId: "demo-project-commercial", date: "2026-09-24", summary: "Unassigned site update." }), /not assigned/);
  assert.ok(searchDemo((await readDemo(db)).snapshot.tables, "foreman", "add daily report", "demo-user-foreman").some((item) => item.type === "Action"));
});

test("project budget and dated progress persist without inventing unposted costs", async () => {
  const db = database();
  await readDemo(db);
  await registerDemoProject(db, { code: "BUD-001", name: "Budgeted site", location: "Cebu", siteName: "Budgeted site A", status: "active", startDate: "2026-09-01", targetCompletionDate: "2027-03-01", contractValueCentavos: 250_000_000, initialBudgetCentavos: 180_000_000 });
  const created = (await readDemo(db)).snapshot.tables.projects.find((project) => project.code === "BUD-001");
  assert.ok(created);
  assert.equal(created.initialBudgetCentavos, 180_000_000);
  assert.equal(created.targetCompletionDate, "2027-03-01");
  await assert.rejects(updateDemoRecord(db, "projects", created.id, { targetCompletionDate: "2026-08-31" }), /before the start date/);
  const invalid = structuredClone((await readDemo(db)).snapshot);
  invalid.tables.projects.find((project) => project.id === created.id)!.targetCompletionDate = "2026-08-31";
  await assert.rejects(importDemo(db, JSON.stringify(invalid)), /Invalid project timeline/);
  await registerDemoDailyReport(db, { projectId: created.id, date: "2026-09-23", summary: "First progress check", progressPercent: 20 });
  await registerDemoDailyReport(db, { projectId: created.id, date: "2026-09-24", summary: "No percentage recorded" });
  const tables = (await readDemo(db)).snapshot.tables;
  const overview = demoProjectOverview(tables, created.id);
  assert.equal(overview.latestProgress?.progressPercent, 20);
  assert.equal(overview.materialCostCentavos, 0);
  await updateDemoRecord(db, "projects", created.id, { initialBudgetCentavos: 190_000_000 });
  assert.equal((await readDemo(db)).snapshot.tables.projects.find((project) => project.id === created.id)?.initialBudgetCentavos, 190_000_000);
  await selectDemoUser(db, "demo-user-foreman");
  await assert.rejects(updateDemoRecord(db, "projects", created.id, { initialBudgetCentavos: 200_000_000 }), /cannot make that change/);
  assert.equal(parseDemoProjectAmount("125000.50", "Budget"), 12_500_050);
  assert.equal(parseDemoProjectAmount("1,234,567.89", "Budget"), 123_456_789);
  assert.throws(() => parseDemoProjectAmount("12,34.00", "Budget"), /two decimal places/);
  assert.throws(() => parseDemoProjectAmount("125.999", "Budget"), /two decimal places/);
});

test("supplier quote history is append-only and worker preview stays self-scoped", async () => {
  const db = database();
  const initial = (await readDemo(db)).snapshot.tables;
  assert.equal(initial.supplierPrices.filter((price) => price.supplierId === "demo-supplier-hardware").length, 2);
  assert.ok(initial.users.some((user) => user.id === "demo-user-worker" && user.role === "worker"));
  assert.equal(initial.employees.find((employee) => employee.id === "demo-employee-mason")?.userId, "demo-user-worker");
  await recordDemoSupplierPrice(db, { supplierId: "demo-supplier-hardware", materialId: "demo-material-cement", priceCentavos: 12500, effectiveOn: "2026-09-25" });
  await assert.rejects(recordDemoSupplierPrice(db, { supplierId: "demo-supplier-hardware", materialId: "demo-material-cement", priceCentavos: 13000, effectiveOn: "2026-09-25" }), /already exists/);
  assert.equal((await readDemo(db)).snapshot.tables.supplierPrices.filter((price) => price.materialId === "demo-material-cement").length, 3);
  await selectDemoUser(db, "demo-user-worker");
  await assert.rejects(recordDemoSupplierPrice(db, { supplierId: "demo-supplier-hardware", materialId: "demo-material-cement", priceCentavos: 14000, effectiveOn: "2026-09-26" }), /Only a manager/);
});

test("foreman request, approval, dispatch, receipt and consumption reconcile without double-costing", async () => {
  const db = database();
  await readDemo(db);
  const base = { projectId: "demo-project-residential", siteId: "demo-site-residential", warehouseId: "demo-warehouse-main", materialId: "demo-material-cement", quantity: 50, purpose: "Foundation pour" };
  await assert.rejects(submitDemoMaterialRequest(db, base), /Only assigned project staff/);
  assert.ok(!searchDemo((await readDemo(db)).snapshot.tables, "admin", "new material request", "demo-user-admin").some((item) => item.type === "Action"));
  await selectDemoUser(db, "demo-user-foreman");
  await assert.rejects(submitDemoMaterialRequest(db, { ...base, projectId: "demo-project-commercial", siteId: "demo-site-commercial" }), /not assigned/);
  await submitDemoMaterialRequest(db, base);
  const submitted = (await readDemo(db)).snapshot.tables.materialRequests.find((row) => !row.legacy);
  assert.ok(submitted && !submitted.legacy);
  await assert.rejects(decideDemoMaterialRequest(db, { requestId: submitted.id, approvedQuantity: 50, unitCostCentavos: 25_000 }), /cannot approve/);
  await selectDemoUser(db, "demo-user-admin");
  await assert.rejects(decideDemoMaterialRequest(db, { requestId: submitted.id, approvedQuantity: 60, unitCostCentavos: 25_000 }), /exceed/);
  await decideDemoMaterialRequest(db, { requestId: submitted.id, approvedQuantity: 50, unitCostCentavos: 25_000 });
  await selectDemoUser(db, "demo-user-warehouse");
  const dispatch = { requestId: submitted.id, quantity: 50, operationId: "demo-move-dispatch-first" };
  await dispatchDemoMaterialRequest(db, dispatch);
  await dispatchDemoMaterialRequest(db, dispatch);
  await assert.rejects(dispatchDemoMaterialRequest(db, { ...dispatch, operationId: "demo-move-dispatch-extra", quantity: 1 }), /exceeds/);
  await selectDemoUser(db, "demo-user-foreman");
  await receiveDemoMaterialRequest(db, { requestId: submitted.id, quantity: 50, operationId: "demo-move-receipt-first" });
  await consumeDemoMaterialRequest(db, { requestId: submitted.id, quantity: 20, operationId: "demo-move-consume-first" });
  await consumeDemoMaterialRequest(db, { requestId: submitted.id, quantity: 20, operationId: "demo-move-consume-first" });
  const tables = (await readDemo(db)).snapshot.tables;
  const request = tables.materialRequests.find((row) => row.id === submitted.id);
  assert.ok(request && !request.legacy);
  assert.deepEqual(demoRequestProgress(tables, request), { dispatched: 50, received: 50, consumed: 20, toDispatch: 0, inTransit: 0, atSite: 30, costCentavos: 500_000 });
  assert.equal(demoRequestStatusLabel(request, demoRequestProgress(tables, request)), "At site");
  assert.equal(tables.balances.find((row) => row.materialId === base.materialId)?.quantity, 190);
  assert.equal(tables.siteBalances.find((row) => row.siteId === base.siteId)?.quantity, 30);
  assert.equal(tables.requestMovements.length, 3);
  assert.equal(tables.auditLogs.filter((row) => row.recordId === submitted.id && row.action === "dispatch").length, 1);
  assert.equal(tables.auditLogs.filter((row) => row.recordId === submitted.id && row.action === "consume").length, 1);
  assert.equal(tables.requestMovements.find((row) => row.kind === "consumption")?.unitCostCentavos, 25_000);
  assert.equal(demoProjectOverview(tables, base.projectId).materialCostCentavos, 500_000);
  assert.equal(demoProjectOverview(tables, "demo-project-commercial").materialCostCentavos, 0);
  await assert.rejects(consumeDemoMaterialRequest(db, { requestId: submitted.id, quantity: 31, operationId: "demo-move-consume-too-much" }), /exceeds/);
});

test("warehouse staff needs explicit access and competing dispatches cannot oversell", async () => {
  const db = database();
  await readDemo(db);
  await registerDemoWarehouse(db, { name: "Restricted Depot", location: "Cebu" });
  const warehouseId = (await readDemo(db)).snapshot.tables.warehouses.find((row) => row.name === "Restricted Depot")!.id;
  await recordDemoStockIn(db, { materialId: "demo-material-cement", warehouseId, quantity: 10, operationId: "demo-stock-restricted" });
  await selectDemoUser(db, "demo-user-foreman");
  await submitDemoMaterialRequest(db, { projectId: "demo-project-residential", siteId: "demo-site-residential", warehouseId, materialId: "demo-material-cement", quantity: 10, purpose: "Test access" });
  await selectDemoUser(db, "demo-user-admin");
  const request = (await readDemo(db)).snapshot.tables.materialRequests.find((row) => !row.legacy)!;
  await decideDemoMaterialRequest(db, { requestId: request.id, approvedQuantity: 10, unitCostCentavos: 100 });
  await selectDemoUser(db, "demo-user-warehouse");
  await assert.rejects(dispatchDemoMaterialRequest(db, { requestId: request.id, quantity: 1, operationId: "demo-move-denied" }), /cannot handle/);
  await selectDemoUser(db, "demo-user-admin");
  await assignDemoWarehouse(db, { userId: "demo-user-warehouse", warehouseId });
  await selectDemoUser(db, "demo-user-warehouse");
  const results = await Promise.allSettled([
    dispatchDemoMaterialRequest(db, { requestId: request.id, quantity: 7, operationId: "demo-move-race-a" }),
    dispatchDemoMaterialRequest(db, { requestId: request.id, quantity: 7, operationId: "demo-move-race-b" }),
  ]);
  assert.equal(results.filter((row) => row.status === "fulfilled").length, 1);
  assert.equal((await readDemo(db)).snapshot.tables.balances.find((row) => row.warehouseId === warehouseId)?.quantity, 3);
});

test("version-one imports upgrade without discarding local records", async () => {
  const db = database();
  const initial = (await readDemo(db)).snapshot;
  const old = structuredClone(initial) as unknown as { schemaVersion: number; tables: Record<string, unknown> };
  old.schemaVersion = 1;
  for (const table of ["projectAssignments", "warehouseMemberships", "siteBalances", "requestMovements", "auditLogs"]) delete old.tables[table];
  await importDemo(db, JSON.stringify(old));
  const upgraded = (await readDemo(db)).snapshot;
  assert.equal(upgraded.schemaVersion, DEMO_SCHEMA_VERSION);
  assert.equal(upgraded.tables.projects.length, initial.tables.projects.length);
  assert.equal(upgraded.tables.projectAssignments.length, 2);
  assert.equal(upgraded.tables.auditLogs.length, 0);
});

test("version-two imports gain an empty audit trail without losing records", async () => {
  const db = database();
  const old = structuredClone((await readDemo(db)).snapshot) as unknown as { schemaVersion: number; tables: Record<string, unknown> };
  old.schemaVersion = 2;
  delete old.tables.auditLogs;
  await importDemo(db, JSON.stringify(old));
  const upgraded = (await readDemo(db)).snapshot;
  assert.equal(upgraded.schemaVersion, DEMO_SCHEMA_VERSION);
  assert.equal(upgraded.tables.projects.length, 2);
  assert.deepEqual(upgraded.tables.auditLogs, []);
});

test("version-three imports gain an empty QR registry without losing records", async () => {
  const db = database();
  const old = structuredClone((await readDemo(db)).snapshot) as unknown as { schemaVersion: number; tables: Record<string, unknown> };
  old.schemaVersion = 3;
  delete old.tables.qrCodes;
  await importDemo(db, JSON.stringify(old));
  const upgraded = (await readDemo(db)).snapshot;
  assert.equal(upgraded.schemaVersion, DEMO_SCHEMA_VERSION);
  assert.ok(upgraded.tables.qrCodes.length > 0);
  assert.equal(upgraded.tables.projects.length, 2);
});

test("demo profile updates are self-scoped and QR labels are manager-only and idempotent", async () => {
  const db = database();
  await readDemo(db);
  await updateDemoProfile(db, { name: "Demo Admin Updated", email: "admin.updated@nognog.demo", phone: "+63 917 555 0200" });
  let tables = (await readDemo(db)).snapshot.tables;
  assert.equal(tables.users.find((user) => user.id === "demo-user-admin")?.name, "Demo Admin Updated");
  await registerDemoWarehouse(db, { name: "QR Depot", location: "Cebu City", municipalityCode: "0730600000" });
  tables = (await readDemo(db)).snapshot.tables;
  const warehouse = tables.warehouses.find((row) => row.name === "QR Depot");
  assert.ok(warehouse);
  const qrId = await generateDemoQr(db, "warehouse", warehouse.id);
  assert.equal(await generateDemoQr(db, "warehouse", warehouse.id), qrId);
  tables = (await readDemo(db)).snapshot.tables;
  assert.equal(tables.qrCodes.filter((code) => code.entityId === warehouse.id).length, 1);
  assert.equal(tables.qrCodes.find((code) => code.id === qrId)?.entityId, warehouse.id);
  await deleteDemoRecord(db, "warehouses", warehouse.id);
  assert.equal((await readDemo(db)).snapshot.tables.qrCodes.some((code) => code.id === qrId), false);
  await selectDemoUser(db, "demo-user-foreman");
  await assert.rejects(generateDemoQr(db, "material", "demo-material-cement"), /Only a manager/);
  await updateDemoProfile(db, { name: "Foreman Updated", email: "foreman@nognog.demo", phone: "" });
  tables = (await readDemo(db)).snapshot.tables;
  assert.equal(tables.users.find((user) => user.id === "demo-user-foreman")?.name, "Foreman Updated");
  assert.equal(tables.users.find((user) => user.id === "demo-user-admin")?.name, "Demo Admin Updated");
  await assert.rejects(updateDemoProfile(db, { name: "Foreman Updated", email: "admin.updated@nognog.demo", phone: "" }), /already used/);
});

test("audit entries commit with authorized demo changes and ignore rejected or repeated operations", async () => {
  const db = database();
  await readDemo(db);
  await registerDemoWarehouse(db, { name: "Audit Depot", location: "Cebu" });
  let tables = (await readDemo(db)).snapshot.tables;
  const warehouse = tables.warehouses.find((row) => row.name === "Audit Depot");
  assert.ok(warehouse);
  assert.equal(tables.auditLogs.length, 1);
  assert.equal(tables.auditLogs[0].actorId, "demo-user-admin");
  await assert.rejects(registerDemoWarehouse(db, { name: "Audit Depot", location: "Cebu" }), /already exists/);
  assert.equal((await readDemo(db)).snapshot.tables.auditLogs.length, 1);
  await updateDemoRecord(db, "warehouses", warehouse.id, { location: "Mandaue" });
  await deleteDemoRecord(db, "warehouses", warehouse.id);
  tables = (await readDemo(db)).snapshot.tables;
  assert.deepEqual(tables.auditLogs.map((row) => row.action).toSorted(), ["create", "delete", "update"]);
  await selectDemoUser(db, "demo-user-foreman");
  await assert.rejects(registerDemoWarehouse(db, { name: "Denied Depot", location: "Cebu" }), /cannot make that change/);
  assert.equal((await readDemo(db)).snapshot.tables.auditLogs.length, 3);
  const exported = await exportDemo(db);
  await saveDemoSnapshot(db);
  await resetDemo(db);
  assert.equal((await readDemo(db)).snapshot.tables.auditLogs.length, 0);
  await importDemo(db, exported);
  assert.equal((await readDemo(db)).snapshot.tables.auditLogs.length, 3);
  await resetDemo(db);
  await restoreDemoSnapshot(db);
  assert.equal((await readDemo(db)).snapshot.tables.auditLogs.length, 3);
});

test("demo admin can add a local account, while inactive accounts cannot be selected", async () => {
  const db = database();
  await readDemo(db);
  await registerDemoUser(db, { name: "Preview Engineer", email: "preview@example.test", role: "engineer" });
  await assert.rejects(registerDemoUser(db, { name: "Preview Owner", email: "owner@example.test", role: "owner" }), /cannot create/);
  await assert.rejects(registerDemoUser(db, { name: "Preview Admin", email: "admin@example.test", role: "admin" }), /cannot create/);
  const created = (await readDemo(db)).snapshot.tables.users.find((user) => user.email === "preview@example.test");
  assert.ok(created);
  await assert.rejects(registerDemoUser(db, { name: "Duplicate", email: "preview@example.test", role: "foreman" }), /already in use/);
  await setDemoUserActive(db, created.id, false);
  await assert.rejects(selectDemoUser(db, created.id), /unavailable/);
  await selectDemoUser(db, "demo-user-foreman");
  await assert.rejects(registerDemoUser(db, { name: "Denied", email: "denied@example.test", role: "engineer" }), /cannot create/);
});

test("admin preview can register equipment and worker preview cannot", async () => {
  const db = database();
  await readDemo(db);
  await registerDemoUser(db, { name: "Preview Worker", email: "worker@example.test", role: "worker" });
  const users = (await readDemo(db)).snapshot.tables.users;
  await registerDemoEquipment(db, { code: "EQ-ADMIN", name: "Site drill", status: "available", location: "Main Warehouse" });
  await selectDemoUser(db, users.find((user) => user.role === "worker")!.id);
  await assert.rejects(registerDemoEquipment(db, { code: "EQ-WORKER", name: "Denied drill", status: "available", location: "Main Warehouse" }), /cannot make that change/);
});

test("employee photos stay local, validate WebP data, and require a manager role", async () => {
  const db = database();
  await readDemo(db);
  const photo = `data:image/webp;base64,${Buffer.from("RIFFdemoWEBP").toString("base64")}`;
  await updateDemoEmployeePhoto(db, "demo-employee-carpenter", photo);
  assert.equal((await readDemo(db)).snapshot.tables.employees.find((employee) => employee.id === "demo-employee-carpenter")?.photo, photo);
  await assert.rejects(updateDemoEmployeePhoto(db, "demo-employee-carpenter", "https://example.com/image.svg"));
  await selectDemoUser(db, "demo-user-foreman");
  await assert.rejects(updateDemoEmployeePhoto(db, "demo-employee-carpenter", null), /cannot make that change/);
});

test("export and import round-trip, reset restores original data", async () => {
  const db = database();
  await initializeDemo(db);
  const exported = await exportDemo(db);
  const parsed = JSON.parse(exported);
  assert.equal(parsed.schemaVersion, DEMO_SCHEMA_VERSION);
  await db.table("projects").delete("demo-project-commercial");
  await importDemo(db, exported);
  assert.equal((await readDemo(db)).snapshot.tables.projects.length, 2);
  await db.table("notifications").put({ id: "demo-notification-test", userId: "demo-user-admin", message: "Local notice", read: false, date: "2026-09-01" });
  await resetDemo(db);
  const restored = await readDemo(db);
  assert.equal(restored.snapshot.tables.notifications.length, createDemoSeed().tables.notifications.length);
  assert.equal(restored.snapshot.tables.transactions.length, 3);
});

test("demo notifications can only be marked read by their selected owner", async () => {
  const db = database();
  await readDemo(db);
  await assert.rejects(markDemoNotificationRead(db, "demo-notification-report", "demo-user-foreman"), /unavailable/);
  assert.equal((await db.table("notifications").get("demo-notification-report")).read, false);
  await markDemoNotificationRead(db, "demo-notification-report", "demo-user-admin");
  assert.equal((await db.table("notifications").get("demo-notification-report")).read, true);
  await assert.rejects(markDemoNotificationsUnread(db, "demo-user-foreman"), /unavailable/);
  assert.equal((await db.table("notifications").get("demo-notification-report")).read, true);
  assert.equal(await markDemoNotificationsUnread(db, "demo-user-admin"), 1);
  assert.equal((await db.table("notifications").get("demo-notification-report")).read, false);
});

test("admin can register a material and stock-in remains ledger-consistent and idempotent", async () => {
  const db = database();
  await readDemo(db);
  await registerDemoMaterial(db, { code: "blk-001", name: "Concrete blocks", unit: "pieces", warehouseId: "demo-warehouse-main", quantity: 12 });
  const registered = await readDemo(db);
  const material = registered.snapshot.tables.materials.find((item) => item.code === "BLK-001");
  assert.ok(material);
  await assert.rejects(registerDemoMaterial(db, { code: "BLK-001", name: "Duplicate", unit: "pieces", warehouseId: "demo-warehouse-main", quantity: 1 }), /already exists/);
  await selectDemoUser(db, "demo-user-warehouse");
  const movement = { materialId: material.id, warehouseId: "demo-warehouse-main", quantity: 8, operationId: "demo-transaction-stock-in-test" };
  await recordDemoStockIn(db, movement);
  await recordDemoStockIn(db, movement);
  const result = await readDemo(db);
  assert.equal(result.snapshot.tables.balances.find((item) => item.materialId === material.id)?.quantity, 20);
  assert.equal(result.snapshot.tables.transactions.filter((item) => item.materialId === material.id).length, 2);
  await assert.rejects(recordDemoStockIn(db, { ...movement, quantity: 9 }), /already used/);
  await assert.rejects(registerDemoMaterial(db, { code: "BLK-002", name: "Other blocks", unit: "pieces", warehouseId: "demo-warehouse-main", quantity: 1 }), /cannot make/);
});

test("only demo admin can register equipment and duplicate codes are rejected", async () => {
  const db = database();
  await readDemo(db);
  const asset = { code: "eq-003", name: "Plate compactor", status: "available" as const, location: "Main Warehouse" };
  await selectDemoUser(db, "demo-user-warehouse");
  await assert.rejects(registerDemoEquipment(db, asset), /cannot make/);
  await selectDemoUser(db, "demo-user-admin");
  await registerDemoEquipment(db, asset);
  await assert.rejects(registerDemoEquipment(db, asset), /already exists/);
  assert.equal((await readDemo(db)).snapshot.tables.equipment.find((item) => item.code === "EQ-003")?.name, "Plate compactor");
});

test("engineer equipment request needs admin approval and handover before custody changes", async () => {
  const db = database();
  await readDemo(db);
  const neededOn = new Date().toISOString().slice(0, 10);
  const expectedReturnOn = new Date(Date.now() + 7 * 86400000).toISOString().slice(0, 10);
  const input = { assetId: "demo-equipment-mixer", projectId: "demo-project-residential", siteId: "demo-site-residential", neededOn, expectedReturnOn, purpose: "Mix concrete for the foundation" };
  await selectDemoUser(db, "demo-user-engineer");
  await submitDemoEquipmentRequest(db, input);
  await assert.rejects(submitDemoEquipmentRequest(db, input), /already have a pending request/);
  let tables = (await readDemo(db)).snapshot.tables;
  const requestId = tables.equipmentRequests[0]?.id;
  assert.ok(requestId);
  assert.equal(tables.equipment.find((item) => item.id === input.assetId)?.status, "available");
  await assert.rejects(decideDemoEquipmentRequest(db, requestId, true, ""), /Only an admin/);
  await selectDemoUser(db, "demo-user-admin");
  await assert.rejects(submitDemoEquipmentRequest(db, input), /Only assigned project staff/);
  await decideDemoEquipmentRequest(db, requestId, true, "Approved for foundation work");
  await assert.rejects(deleteDemoRecord(db, "equipment", input.assetId), /history/);
  await checkoutDemoEquipmentRequest(db, requestId);
  tables = (await readDemo(db)).snapshot.tables;
  assert.equal(tables.equipment.find((item) => item.id === input.assetId)?.status, "assigned");
  assert.equal(tables.equipment.find((item) => item.id === input.assetId)?.location, "Residential Building A Site");
  await assert.rejects(updateDemoRecord(db, "equipment", input.assetId, { status: "available" }), /Return checked-out/);
  await assert.rejects(checkoutDemoEquipmentRequest(db, requestId), /not approved/);
  const exported = await exportDemo(db);
  assert.equal(JSON.parse(exported).tables.equipmentRequests[0].status, "checked_out");
  await returnDemoEquipmentRequest(db, requestId, true, "Hydraulic hose needs inspection");
  tables = (await readDemo(db)).snapshot.tables;
  assert.equal(tables.equipment.find((item) => item.id === input.assetId)?.status, "under_maintenance");
  assert.equal(tables.equipment.find((item) => item.id === input.assetId)?.location, "Main Warehouse");
  assert.equal(tables.equipmentRequests[0]?.status, "returned");
  assert.equal(tables.equipmentRequests[0]?.needsMaintenance, true);
  assert.equal(tables.auditLogs.filter((item) => item.entity === "equipmentRequests").length, 4);
});

test("version-four demo imports gain an empty equipment handover ledger", async () => {
  const db = database();
  const old = structuredClone((await readDemo(db)).snapshot) as unknown as { schemaVersion: number; tables: Record<string, unknown> };
  old.schemaVersion = 4;
  delete old.tables.equipmentRequests;
  await importDemo(db, JSON.stringify(old));
  const upgraded = (await readDemo(db)).snapshot;
  assert.equal(upgraded.schemaVersion, DEMO_SCHEMA_VERSION);
  assert.deepEqual(upgraded.tables.equipmentRequests, []);
  assert.equal(upgraded.tables.equipment.length, 2);
});

test("version-five demo imports gain an empty supplier quote ledger", async () => {
  const db = database();
  const old = structuredClone((await readDemo(db)).snapshot) as unknown as { schemaVersion: number; tables: Record<string, unknown> };
  old.schemaVersion = 5;
  delete old.tables.supplierPrices;
  await importDemo(db, JSON.stringify(old));
  const upgraded = (await readDemo(db)).snapshot;
  assert.equal(upgraded.schemaVersion, DEMO_SCHEMA_VERSION);
  assert.deepEqual(upgraded.tables.supplierPrices, []);
  assert.equal(upgraded.tables.suppliers.length, (old.tables.suppliers as unknown[]).length);
});

test("project material plans calculate need without moving stock and enforce roles", async () => {
  const db = database();
  const initial = (await readDemo(db)).snapshot.tables;
  const plan = initial.projectMaterialPlans[0];
  assert.ok(plan);
  assert.deepEqual(demoMaterialPlanSummary(initial, plan), { used: 0, onSite: 0, openRequests: 0, need: 350, warehouseOnHand: 240, sourceGap: 110 });
  await saveDemoMaterialPlan(db, { ...plan, plannedQuantity: 400 });
  await assert.rejects(saveDemoMaterialPlan(db, { projectId: plan.projectId, siteId: plan.siteId, warehouseId: plan.warehouseId, materialId: plan.materialId, plannedQuantity: 500 }), /already planned/);
  const afterEdit = (await readDemo(db)).snapshot.tables;
  assert.equal(afterEdit.projectMaterialPlans[0]?.plannedQuantity, 400);
  assert.deepEqual(afterEdit.balances, initial.balances);
  await selectDemoUser(db, "demo-user-engineer");
  await assert.rejects(saveDemoMaterialPlan(db, { ...plan, plannedQuantity: 450 }), /assigned project manager/);
  await submitDemoMaterialRequest(db, { projectId: plan.projectId, siteId: plan.siteId, warehouseId: plan.warehouseId, materialId: plan.materialId, quantity: 50, purpose: "Foundation work" });
  const requested = (await readDemo(db)).snapshot.tables;
  assert.equal(demoMaterialPlanSummary(requested, requested.projectMaterialPlans[0]!).need, 350);
  await selectDemoUser(db, "demo-user-admin");
  await deleteDemoMaterialPlan(db, plan.id);
  assert.equal((await readDemo(db)).snapshot.tables.projectMaterialPlans.length, 0);
});

test("version-six demo imports gain an empty material plan", async () => {
  const db = database();
  const old = structuredClone((await readDemo(db)).snapshot) as unknown as { schemaVersion: number; tables: Record<string, unknown> };
  old.schemaVersion = 6;
  delete old.tables.projectMaterialPlans;
  await importDemo(db, JSON.stringify(old));
  assert.deepEqual((await readDemo(db)).snapshot.tables.projectMaterialPlans, []);
});

test("admin can withdraw an approved equipment reservation after custody changes", async () => {
  const db = database();
  await readDemo(db);
  const neededOn = new Date().toISOString().slice(0, 10);
  await selectDemoUser(db, "demo-user-engineer");
  await submitDemoEquipmentRequest(db, { assetId: "demo-equipment-mixer", projectId: "demo-project-residential", siteId: "demo-site-residential", neededOn, expectedReturnOn: neededOn, purpose: "Concrete pour" });
  const id = (await readDemo(db)).snapshot.tables.equipmentRequests[0]?.id;
  assert.ok(id);
  await selectDemoUser(db, "demo-user-admin");
  await decideDemoEquipmentRequest(db, id, true, "Approved");
  await updateDemoRecord(db, "equipment", "demo-equipment-mixer", { status: "under_maintenance" });
  await assert.rejects(checkoutDemoEquipmentRequest(db, id), /custody changed/);
  await decideDemoEquipmentRequest(db, id, false, "Equipment needs maintenance");
  const request = (await readDemo(db)).snapshot.tables.equipmentRequests[0];
  assert.equal(request?.status, "rejected");
  assert.equal(request?.sourceLocationId, undefined);
});

test("existing local demo data receives sample notices once without overwriting read state", async () => {
  const db = database();
  await readDemo(db);
  await db.table("notifications").clear();
  await db.meta.delete("demoNotificationSeedV2");
  await initializeDemo(db);
  assert.equal((await db.table("notifications").count()), createDemoSeed().tables.notifications.length);
  await markDemoNotificationRead(db, "demo-notification-report", "demo-user-admin");
  await initializeDemo(db);
  assert.equal((await db.table("notifications").get("demo-notification-report")).read, true);
});

test("saved snapshot restores records and account after reset", async () => {
  const db = database();
  await readDemo(db);
  await selectDemoUser(db, "demo-user-engineer");
  await db.table("projects").put({ id: "demo-project-saved", code: "DEMO-004", name: "Saved project", status: "active", location: "Cebu" });
  const saved = await saveDemoSnapshot(db);
  assert.equal((await getSavedSnapshotInfo(db))?.savedAt, saved.savedAt);
  await resetDemo(db);
  assert.equal((await readDemo(db)).snapshot.tables.projects.length, 2);
  await restoreDemoSnapshot(db);
  const restored = await readDemo(db);
  assert.equal(restored.snapshot.tables.projects.length, 3);
  assert.equal(restored.selectedUserId, "demo-user-engineer");
  assert.equal((await getSavedSnapshotInfo(db))?.savedAt, saved.savedAt);
});

test("restoring without a snapshot fails without changing demo data", async () => {
  const db = database();
  const original = await readDemo(db);
  await assert.rejects(restoreDemoSnapshot(db), /No saved demo snapshot/);
  assert.deepEqual((await readDemo(db)).snapshot.tables, original.snapshot.tables);
});

test("malformed or foreign-ID imports leave the original data intact", async () => {
  const db = database();
  const original = await readDemo(db);
  await assert.rejects(importDemo(db, "not json"), /valid JSON/);
  const bad = structuredClone(original.snapshot);
  bad.tables.projects[0].id = "production-id";
  await assert.rejects(importDemo(db, JSON.stringify(bad)));
  const inconsistent = structuredClone(original.snapshot);
  inconsistent.tables.balances[0].quantity += 1;
  await assert.rejects(importDemo(db, JSON.stringify(inconsistent)), /does not match/);
  assert.deepEqual((await readDemo(db)).snapshot.tables, original.snapshot.tables);
});

test("broken local storage never silently reseeds or falls back", async () => {
  const db = database();
  await db.table("projects").put({ id: "demo-project-orphan", code: "DEMO-X", name: "Orphan", status: "active", location: "Cebu" });
  await assert.rejects(initializeDemo(db), /Incomplete demo data/);
  assert.equal(await db.table("projects").count(), 1);
});
