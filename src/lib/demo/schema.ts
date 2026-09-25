import { z } from "zod";
import type { AppRole } from "@/types/database";

export const DEMO_SCHEMA_VERSION = 8 as const;
export const demoRoles = ["super_admin", "owner", "admin", "project_manager", "engineer", "foreman", "warehouse_staff", "accounting", "worker"] as const satisfies readonly AppRole[];
export type DemoRole = (typeof demoRoles)[number];
export const demoManagerRoles: readonly DemoRole[] = ["super_admin", "owner", "admin"];
export const isDemoManager = (role: DemoRole) => demoManagerRoles.includes(role);

const id = z.string().regex(/^demo-[a-z0-9-]{1,80}$/);
const label = z.string().trim().min(1).max(160);
const municipalityCode = z.string().regex(/^\d{10}$/).optional();
const date = z.iso.date();
const row = z.object({ id });
const qty = z.number().finite().nonnegative().max(1_000_000_000).refine((value) => Number.isSafeInteger(Math.round(value * 1000)) && Math.abs(value * 1000 - Math.round(value * 1000)) < 0.000001, "Use at most three decimal places.");
const cents = z.number().int().nonnegative().safe().max(1_000_000_000);
const projectCents = z.number().int().nonnegative().safe().max(1_000_000_000_000);
const legacyRequest = row.extend({ projectId: id, materialId: id, quantity: qty, status: z.enum(["draft", "submitted", "approved", "released"]), legacy: z.literal(true) });
const workflowRequest = row.extend({ projectId: id, siteId: id, warehouseId: id, materialId: id, quantity: qty.positive(), purpose: z.string().trim().min(1).max(300), status: z.enum(["submitted", "approved", "rejected"]), approvedQuantity: qty, unitCostCentavos: cents, requestedBy: id, requestedAt: z.iso.datetime(), decidedBy: id.optional(), decidedAt: z.iso.datetime().optional(), rejectionReason: z.string().trim().min(1).max(300).optional(), legacy: z.literal(false) });
export const demoEmployeePhotoSchema = z.union([
  z.literal("/demo-employee-mason.webp"),
  z.string().max(180_000).regex(/^data:image\/webp;base64,[A-Za-z0-9+/]+={0,2}$/),
]);
export const demoRecordPhotoSchema = z.union([
  z.enum(["/demo-residential.webp", "/demo-commercial.webp", "/demo-warehouse-main.webp", "/demo-warehouse-north.webp", "/demo-daily-report.webp", "/demo-cement.webp", "/demo-steel.webp", "/demo-gravel.webp"]),
  z.string().max(180_000).regex(/^data:image\/webp;base64,[A-Za-z0-9+/]+={0,2}$/),
]);

export const demoSchemas = {
  users: row.extend({ name: label, role: z.enum(demoRoles), email: z.email().optional(), phone: z.string().trim().max(40).optional(), photo: demoEmployeePhotoSchema.optional(), isActive: z.boolean().optional() }),
  projects: row.extend({ code: label, name: label, status: z.enum(["active", "on_hold", "completed"]), location: label, municipalityCode, address: z.string().trim().max(300).optional(), startDate: date.optional(), targetCompletionDate: date.optional(), photo: demoRecordPhotoSchema.optional(), contractValueCentavos: projectCents.optional(), initialBudgetCentavos: projectCents.optional() }),
  projectMaterialPlans: row.extend({ projectId: id, siteId: id, warehouseId: id, materialId: id, plannedQuantity: qty.positive() }),
  sites: row.extend({ projectId: id, name: label }),
  warehouses: row.extend({ name: label, location: label, municipalityCode, address: z.string().trim().max(300).optional(), photo: demoRecordPhotoSchema.optional() }),
  materials: row.extend({ code: label, name: label, unit: label, photo: demoRecordPhotoSchema.optional() }),
  balances: row.extend({ materialId: id, warehouseId: id, quantity: qty }),
  transactions: row.extend({ materialId: id, warehouseId: id, quantity: qty, kind: z.enum(["opening_balance", "stock_in"]), date }),
  equipment: row.extend({ code: label, sku: label.optional(), name: label, status: z.enum(["available", "assigned", "under_maintenance"]), location: label }),
  equipmentRequests: row.extend({
    assetId: id, projectId: id, siteId: id, requestedBy: id, neededOn: date, expectedReturnOn: date,
    purpose: z.string().trim().min(3).max(500), status: z.enum(["submitted", "approved", "rejected", "checked_out", "returned"]),
    decidedBy: id.optional(), decidedAt: z.iso.datetime().optional(), decisionNote: z.string().trim().max(500).optional(),
    sourceLocationId: id.optional(), sourceLocationType: z.enum(["warehouse", "site"]).optional(),
    checkedOutBy: id.optional(), checkedOutAt: z.iso.datetime().optional(),
    returnedBy: id.optional(), returnedAt: z.iso.datetime().optional(), returnNote: z.string().trim().max(500).optional(),
    needsMaintenance: z.boolean().optional(), createdAt: z.iso.datetime(),
  }),
  employees: row.extend({ name: label, trade: label, userId: id.optional(), contactNumber: z.string().trim().regex(/^[0-9+() .-]{7,40}$/).optional(), email: z.email().max(320).optional(), dailyWageCentavos: cents.optional(), photo: demoEmployeePhotoSchema.optional() }),
  employeeAssignments: row.extend({ employeeId: id, projectId: id, siteId: id, startDate: date, endDate: date.optional() }),
  suppliers: row.extend({ name: label, category: label, photo: demoRecordPhotoSchema.optional() }),
  supplierPrices: row.extend({ supplierId: id, materialId: id, priceCentavos: cents.positive(), effectiveOn: date, recordedBy: id, createdAt: z.iso.datetime() }),
  dailyReports: row.extend({ projectId: id, date, summary: z.string().trim().min(1).max(500), progressPercent: z.number().int().min(0).max(100).optional(), photo: demoRecordPhotoSchema.optional() }),
  notifications: row.extend({ userId: id, title: z.string().trim().min(1).max(100).optional(), message: z.string().trim().min(1).max(300), read: z.boolean(), date }),
  materialRequests: z.union([legacyRequest, workflowRequest]),
  projectAssignments: row.extend({ projectId: id, userId: id }),
  warehouseMemberships: row.extend({ warehouseId: id, userId: id }),
  siteBalances: row.extend({ materialId: id, siteId: id, quantity: qty }),
  requestMovements: row.extend({ requestId: id, materialId: id, warehouseId: id, siteId: id, actorId: id, kind: z.enum(["dispatch", "receipt", "consumption"]), quantity: qty.positive(), occurredAt: z.iso.datetime(), unitCostCentavos: cents.optional(), amountCentavos: cents.optional() }),
  attendance: row.extend({ employeeId: id, projectId: id, siteId: id.optional(), assignmentId: id.optional(), date, status: z.enum(["present", "absent"]), hoursWorked: z.number().min(0).max(24).optional(), paidDayBasisPoints: z.number().int().min(0).max(10000).optional(), rateSnapshotCentavos: cents.optional(), costCentavos: cents.optional(), note: z.string().trim().min(3).max(500).optional(), recordedBy: id.optional(), createdAt: z.iso.datetime().optional() }),
  attendanceReversals: row.extend({ attendanceId: id, reason: z.string().trim().min(3).max(500), actorId: id, createdAt: z.iso.datetime() }),
  purchaseOrders: row.extend({ supplierId: id, reference: label, status: z.enum(["draft", "ordered", "received"]) }),
  projectExpenses: row.extend({ projectId: id, amount: qty, description: label, date }),
  auditLogs: row.extend({ actorId: id, entity: label, recordId: id, action: z.enum(["create", "update", "delete", "stock_in", "submit", "approve", "reject", "dispatch", "receipt", "consume", "assign", "reverse"]), detail: z.string().trim().min(1).max(500), createdAt: z.iso.datetime() }),
  qrCodes: row.extend({ entityType: z.enum(["material", "equipment", "warehouse", "project_site"]), entityId: id, identifier: z.string().regex(/^NQ-[A-Z0-9-]{8,80}$/), createdAt: z.iso.datetime(), actorId: id }),
} as const;

export type DemoTable = keyof typeof demoSchemas;
export const demoTableNames = Object.keys(demoSchemas) as DemoTable[];

const arrays = Object.fromEntries(demoTableNames.map((name) => [name, z.array(demoSchemas[name]).max(2000)]));
export const demoSnapshotSchema = z.object({
  schemaVersion: z.literal(DEMO_SCHEMA_VERSION),
  exportedAt: z.iso.datetime(),
  tables: z.object(arrays as { [K in DemoTable]: z.ZodArray<(typeof demoSchemas)[K]> }),
});

export type DemoSnapshot = z.infer<typeof demoSnapshotSchema>;
export type DemoData = DemoSnapshot["tables"];

export const demoMaterialInputSchema = demoSchemas.materials.omit({ id: true }).extend({ warehouseId: id, quantity: qty });
export const demoStockInInputSchema = z.object({ materialId: id, warehouseId: id, quantity: qty.positive(), operationId: id });
export const demoEquipmentInputSchema = demoSchemas.equipment.omit({ id: true });
export const demoEquipmentRequestInputSchema = demoSchemas.equipmentRequests.pick({ assetId: true, projectId: true, siteId: true, neededOn: true, expectedReturnOn: true, purpose: true }).refine((value) => value.expectedReturnOn >= value.neededOn, { path: ["expectedReturnOn"] });
export const demoWarehouseInputSchema = demoSchemas.warehouses.omit({ id: true });
export const demoProjectInputSchema = demoSchemas.projects.omit({ id: true }).extend({ siteName: label });
export const demoMaterialPlanInputSchema = demoSchemas.projectMaterialPlans.extend({ id: id.optional() });
export const demoSupplierInputSchema = demoSchemas.suppliers.omit({ id: true });
export const demoSupplierPriceInputSchema = demoSchemas.supplierPrices.pick({ supplierId: true, materialId: true, priceCentavos: true, effectiveOn: true });
export const demoDailyReportInputSchema = demoSchemas.dailyReports.omit({ id: true });
export const demoEmployeeInputSchema = demoSchemas.employees.omit({ id: true });
export const demoEmployeeAssignmentInputSchema = demoSchemas.employeeAssignments.omit({ id: true });
export const demoAttendanceInputSchema = demoSchemas.attendance.pick({ assignmentId: true, date: true, status: true, hoursWorked: true, paidDayBasisPoints: true, note: true }).required({ assignmentId: true, hoursWorked: true, paidDayBasisPoints: true, note: true });
export const demoRequestInputSchema = workflowRequest.pick({ projectId: true, siteId: true, warehouseId: true, materialId: true, quantity: true, purpose: true });
export const demoRequestDecisionSchema = z.object({ requestId: id, approvedQuantity: qty, unitCostCentavos: cents, rejectionReason: z.string().trim().min(1).max(300).optional() });
export const demoRequestMovementInputSchema = z.object({ requestId: id, quantity: qty.positive(), operationId: id });
export const demoProjectAssignmentInputSchema = demoSchemas.projectAssignments.omit({ id: true });
export const demoWarehouseMembershipInputSchema = demoSchemas.warehouseMemberships.omit({ id: true });
export const demoUserInputSchema = z.object({ name: label, email: z.email(), role: z.enum(demoRoles) });
export const demoProfileInputSchema = z.object({ name: label, email: z.email().max(320), phone: z.string().trim().max(40), photo: demoEmployeePhotoSchema.optional() });
export type DemoMaterialInput = z.infer<typeof demoMaterialInputSchema>;
export type DemoStockInInput = z.infer<typeof demoStockInInputSchema>;
export type DemoEquipmentInput = z.infer<typeof demoEquipmentInputSchema>;
export type DemoEquipmentRequestInput = z.infer<typeof demoEquipmentRequestInputSchema>;
export type DemoWarehouseInput = z.infer<typeof demoWarehouseInputSchema>;
export type DemoProjectInput = z.infer<typeof demoProjectInputSchema>;
export type DemoMaterialPlanInput = z.infer<typeof demoMaterialPlanInputSchema>;
export type DemoSupplierInput = z.infer<typeof demoSupplierInputSchema>;
export type DemoDailyReportInput = z.infer<typeof demoDailyReportInputSchema>;
export type DemoEmployeeInput = z.infer<typeof demoEmployeeInputSchema>;
export type DemoEmployeeAssignmentInput = z.infer<typeof demoEmployeeAssignmentInputSchema>;
export type DemoAttendanceInput = z.infer<typeof demoAttendanceInputSchema>;
export type DemoRequestInput = z.infer<typeof demoRequestInputSchema>;
export type DemoRequestDecision = z.infer<typeof demoRequestDecisionSchema>;
export type DemoRequestMovementInput = z.infer<typeof demoRequestMovementInputSchema>;
export type DemoProjectAssignmentInput = z.infer<typeof demoProjectAssignmentInputSchema>;
export type DemoWarehouseMembershipInput = z.infer<typeof demoWarehouseMembershipInputSchema>;

export function quantityToMilli(value: number): number {
  const parsed = qty.parse(value);
  return Math.round(parsed * 1000);
}

export function milliToQuantity(value: number): number {
  if (!Number.isSafeInteger(value)) throw new Error("Quantity exceeds supported demo precision.");
  return value / 1000;
}

function normalizeSnapshot(input: unknown): unknown {
  if (!input || typeof input !== "object" || ![1, 2, 3, 4, 5, 6, 7].includes(Number((input as { schemaVersion?: unknown }).schemaVersion))) return input;
  const old = input as { schemaVersion: number; tables?: Record<string, unknown>; [key: string]: unknown };
  const tables = old.tables ?? {};
  const attendanceTables = { employeeAssignments: [], attendanceReversals: [], attendance: Array.isArray(tables.attendance) ? tables.attendance.map((entry) => { const row = entry as { id: string; employeeId: string; projectId: string; date: string; status: string }; return { id: row.id, employeeId: row.employeeId, projectId: row.projectId, date: row.date, status: row.status }; }) : [] };
  if (old.schemaVersion === 7) return { ...old, schemaVersion: DEMO_SCHEMA_VERSION, tables: { ...tables, ...attendanceTables } };
  if (old.schemaVersion === 6) return { ...old, schemaVersion: DEMO_SCHEMA_VERSION, tables: { ...tables, projectMaterialPlans: [], ...attendanceTables } };
  if (old.schemaVersion === 5) return { ...old, schemaVersion: DEMO_SCHEMA_VERSION, tables: { ...tables, supplierPrices: [], projectMaterialPlans: [], ...attendanceTables } };
  if (old.schemaVersion === 4) return { ...old, schemaVersion: DEMO_SCHEMA_VERSION, tables: { ...tables, equipmentRequests: [], supplierPrices: [], projectMaterialPlans: [], ...attendanceTables } };
  if (old.schemaVersion === 3) return { ...old, schemaVersion: DEMO_SCHEMA_VERSION, tables: { ...tables, qrCodes: [], equipmentRequests: [], supplierPrices: [], projectMaterialPlans: [], ...attendanceTables } };
  if (old.schemaVersion === 2) return { ...old, schemaVersion: DEMO_SCHEMA_VERSION, tables: { ...tables, auditLogs: [], qrCodes: [], equipmentRequests: [], supplierPrices: [], projectMaterialPlans: [], ...attendanceTables } };
  const projects = Array.isArray(tables.projects) ? tables.projects as { id?: string }[] : [];
  const users = Array.isArray(tables.users) ? tables.users as { id?: string; role?: string }[] : [];
  const warehouses = Array.isArray(tables.warehouses) ? tables.warehouses as { id?: string }[] : [];
  const hasProject = (id: string) => projects.some((row) => row.id === id);
  const hasUser = (id: string) => users.some((row) => row.id === id);
  const hasWarehouse = (id: string) => warehouses.some((row) => row.id === id);
  const assignments = [
    { id: "demo-assignment-engineer-residential", userId: "demo-user-engineer", projectId: "demo-project-residential" },
    { id: "demo-assignment-foreman-residential", userId: "demo-user-foreman", projectId: "demo-project-residential" },
  ].filter((row) => hasUser(row.userId) && ["engineer", "foreman"].includes(users.find((user) => user.id === row.userId)?.role ?? "") && hasProject(row.projectId));
  const memberships = ["demo-warehouse-main", "demo-warehouse-north"].filter(hasWarehouse).map((warehouseId) => ({ id: `demo-membership-${warehouseId}`, userId: "demo-user-warehouse", warehouseId })).filter((row) => users.find((user) => user.id === row.userId)?.role === "warehouse_staff");
  return { ...old, schemaVersion: DEMO_SCHEMA_VERSION, tables: { ...tables, materialRequests: Array.isArray(tables.materialRequests) ? tables.materialRequests.map((request) => ({ ...(request as object), legacy: true })) : tables.materialRequests, projectAssignments: assignments, warehouseMemberships: memberships, siteBalances: [], requestMovements: [], auditLogs: [], qrCodes: [], equipmentRequests: [], supplierPrices: [], projectMaterialPlans: [], ...attendanceTables } };
}
export type DemoUserInput = z.infer<typeof demoUserInputSchema>;

export function validateDemoSnapshot(input: unknown): DemoSnapshot {
  const snapshot = demoSnapshotSchema.parse(normalizeSnapshot(input));
  for (const project of snapshot.tables.projects) if (project.startDate && project.targetCompletionDate && project.targetCompletionDate < project.startDate) throw new Error("Invalid project timeline in demo import.");
  for (const name of demoTableNames) {
    const ids = snapshot.tables[name].map((entry) => entry.id);
    if (new Set(ids).size !== ids.length) throw new Error(`Duplicate ${name} identifiers in demo import.`);
  }
  if (!snapshot.tables.users.some((user) => isDemoManager(user.role) && user.isActive !== false)) throw new Error("Demo import needs an active manager account.");
  const emails = snapshot.tables.users.flatMap((user) => user.email ? [user.email.toLowerCase()] : []);
  if (new Set(emails).size !== emails.length) throw new Error("Duplicate demo user email.");
  const validActors = new Set(snapshot.tables.users.map((user) => user.id));
  for (const entry of snapshot.tables.auditLogs) if (!validActors.has(entry.actorId)) throw new Error("Invalid audit actor in demo import.");
  for (const entry of snapshot.tables.qrCodes) {
    const target = entry.entityType === "project_site" ? snapshot.tables.sites : entry.entityType === "material" ? snapshot.tables.materials : entry.entityType === "equipment" ? snapshot.tables.equipment : snapshot.tables.warehouses;
    if (!target.some((row) => row.id === entry.entityId) || !validActors.has(entry.actorId)) throw new Error("Invalid QR reference in demo import.");
  }
  const references = [
    ["sites", "projectId", "projects"], ["projectMaterialPlans", "projectId", "projects"], ["projectMaterialPlans", "siteId", "sites"], ["projectMaterialPlans", "warehouseId", "warehouses"], ["projectMaterialPlans", "materialId", "materials"], ["balances", "materialId", "materials"],
    ["balances", "warehouseId", "warehouses"], ["transactions", "materialId", "materials"],
    ["transactions", "warehouseId", "warehouses"], ["dailyReports", "projectId", "projects"],
    ["notifications", "userId", "users"], ["materialRequests", "projectId", "projects"],
    ["materialRequests", "materialId", "materials"], ["attendance", "employeeId", "employees"],
    ["attendance", "projectId", "projects"], ["employeeAssignments", "employeeId", "employees"],
    ["employeeAssignments", "projectId", "projects"], ["employeeAssignments", "siteId", "sites"],
    ["attendanceReversals", "attendanceId", "attendance"], ["attendanceReversals", "actorId", "users"],
    ["purchaseOrders", "supplierId", "suppliers"],
    ["projectExpenses", "projectId", "projects"], ["supplierPrices", "supplierId", "suppliers"], ["supplierPrices", "materialId", "materials"], ["supplierPrices", "recordedBy", "users"],
    ["equipmentRequests", "assetId", "equipment"], ["equipmentRequests", "projectId", "projects"],
    ["equipmentRequests", "siteId", "sites"], ["equipmentRequests", "requestedBy", "users"],
    ["projectAssignments", "projectId", "projects"], ["projectAssignments", "userId", "users"],
    ["warehouseMemberships", "warehouseId", "warehouses"], ["warehouseMemberships", "userId", "users"],
    ["siteBalances", "materialId", "materials"], ["siteBalances", "siteId", "sites"],
    ["requestMovements", "requestId", "materialRequests"], ["requestMovements", "materialId", "materials"],
    ["requestMovements", "warehouseId", "warehouses"], ["requestMovements", "siteId", "sites"], ["requestMovements", "actorId", "users"],
  ] as const;
  for (const [source, field, target] of references) {
    const validIds = new Set(snapshot.tables[target].map((entry) => entry.id));
    for (const entry of snapshot.tables[source]) {
      if (!validIds.has((entry as unknown as Record<string, string>)[field])) {
        throw new Error(`Invalid ${source}.${field} reference in demo import.`);
      }
    }
  }
  const balanceKeys = snapshot.tables.balances.map((balance) => `${balance.materialId}:${balance.warehouseId}`);
  if (new Set(balanceKeys).size !== balanceKeys.length) throw new Error("Duplicate demo inventory balance.");
  const siteBalanceKeys = snapshot.tables.siteBalances.map((balance) => `${balance.materialId}:${balance.siteId}`);
  if (new Set(siteBalanceKeys).size !== siteBalanceKeys.length) throw new Error("Duplicate demo site balance.");
  const assignmentKeys = snapshot.tables.projectAssignments.map((row) => `${row.userId}:${row.projectId}`);
  if (new Set(assignmentKeys).size !== assignmentKeys.length) throw new Error("Duplicate demo project assignment.");
  const membershipKeys = snapshot.tables.warehouseMemberships.map((row) => `${row.userId}:${row.warehouseId}`);
  if (new Set(membershipKeys).size !== membershipKeys.length) throw new Error("Duplicate demo warehouse membership.");
  const supplierPriceKeys = snapshot.tables.supplierPrices.map((row) => `${row.supplierId}:${row.materialId}:${row.effectiveOn}`);
  if (new Set(supplierPriceKeys).size !== supplierPriceKeys.length) throw new Error("Duplicate supplier price effective date in demo import.");
  const planKeys = snapshot.tables.projectMaterialPlans.map((entry) => `${entry.siteId}:${entry.materialId}`);
  if (new Set(planKeys).size !== planKeys.length || snapshot.tables.projectMaterialPlans.some((entry) => snapshot.tables.sites.find((site) => site.id === entry.siteId)?.projectId !== entry.projectId)) throw new Error("Invalid project material plan in demo import.");
  const userById = new Map(snapshot.tables.users.map((row) => [row.id, row]));
  const employeeUserIds = snapshot.tables.employees.flatMap((row) => row.userId ? [row.userId] : []);
  if (new Set(employeeUserIds).size !== employeeUserIds.length || employeeUserIds.some((userId) => userById.get(userId)?.role !== "worker")) throw new Error("Invalid employee account link in demo import.");
  const employeeAssignmentKeys = new Set<string>();
  for (const assignment of snapshot.tables.employeeAssignments) {
    if (snapshot.tables.sites.find((site) => site.id === assignment.siteId)?.projectId !== assignment.projectId || assignment.endDate && assignment.endDate < assignment.startDate) throw new Error("Invalid employee project assignment.");
    const key = `${assignment.employeeId}:${assignment.siteId}:${assignment.startDate}`;
    if (employeeAssignmentKeys.has(key)) throw new Error("Duplicate employee project assignment.");
    employeeAssignmentKeys.add(key);
    if (snapshot.tables.employeeAssignments.some((other) => other.id !== assignment.id && other.employeeId === assignment.employeeId && other.siteId === assignment.siteId && (other.endDate ?? "9999-12-31") >= assignment.startDate && (assignment.endDate ?? "9999-12-31") >= other.startDate)) throw new Error("Overlapping employee project assignments in demo import.");
  }
  const reversedAttendanceIds = new Set<string>();
  for (const reversal of snapshot.tables.attendanceReversals) {
    if (reversedAttendanceIds.has(reversal.attendanceId) || !isDemoManager(userById.get(reversal.actorId)?.role ?? "worker")) throw new Error("Invalid attendance reversal.");
    reversedAttendanceIds.add(reversal.attendanceId);
  }
  const postedAttendanceKeys = new Set<string>();
  const workedHours = new Map<string, number>();
  for (const entry of snapshot.tables.attendance) {
    if (entry.siteId && snapshot.tables.sites.find((site) => site.id === entry.siteId)?.projectId !== entry.projectId) throw new Error("Attendance site is outside the project.");
    if (entry.assignmentId) {
      const assignment = snapshot.tables.employeeAssignments.find((row) => row.id === entry.assignmentId);
      if (!assignment || assignment.employeeId !== entry.employeeId || assignment.projectId !== entry.projectId || assignment.siteId !== entry.siteId || entry.date < assignment.startDate || assignment.endDate && entry.date > assignment.endDate) throw new Error("Attendance does not match its employee assignment.");
      const actor = userById.get(entry.recordedBy ?? "");
      if (!actor || !isDemoManager(actor.role) || entry.hoursWorked === undefined || entry.paidDayBasisPoints === undefined || entry.costCentavos === undefined || !entry.note || !entry.createdAt) throw new Error("Incomplete posted attendance.");
      if (entry.status === "absent" ? entry.hoursWorked !== 0 || entry.paidDayBasisPoints !== 0 || entry.costCentavos !== 0 || entry.rateSnapshotCentavos !== undefined : entry.hoursWorked <= 0 || entry.paidDayBasisPoints <= 0 || entry.rateSnapshotCentavos === undefined || entry.costCentavos !== Math.round(entry.rateSnapshotCentavos * entry.paidDayBasisPoints / 10000)) throw new Error("Attendance cost does not reconcile.");
      if (Math.abs(entry.hoursWorked * 100 - Math.round(entry.hoursWorked * 100)) > 0.000001) throw new Error("Attendance hours exceed supported precision.");
    } else if (entry.costCentavos !== undefined) throw new Error("Unassigned legacy attendance cannot post labor cost.");
    if (!reversedAttendanceIds.has(entry.id)) {
      const key = `${entry.employeeId}:${entry.projectId}:${entry.date}`;
      if (postedAttendanceKeys.has(key)) throw new Error("Duplicate active attendance entry.");
      postedAttendanceKeys.add(key);
      const hoursKey = `${entry.employeeId}:${entry.date}`;
      const nextHours = (workedHours.get(hoursKey) ?? 0) + Math.round((entry.hoursWorked ?? 0) * 100);
      if (nextHours > 2400) throw new Error("Employee hours exceed 24 in a demo snapshot.");
      workedHours.set(hoursKey, nextHours);
    }
  }
  const activeEquipmentRequests = new Set<string>();
  for (const request of snapshot.tables.equipmentRequests) {
    const site = snapshot.tables.sites.find((row) => row.id === request.siteId);
    const asset = snapshot.tables.equipment.find((row) => row.id === request.assetId);
    const requester = userById.get(request.requestedBy);
    if (!site || site.projectId !== request.projectId || !asset || !requester || request.expectedReturnOn < request.neededOn) throw new Error("Invalid demo equipment request reference or dates.");
    if (!isDemoManager(requester.role) && !(["project_manager", "engineer", "foreman"].includes(requester.role) && snapshot.tables.projectAssignments.some((row) => row.userId === requester.id && row.projectId === request.projectId))) throw new Error("Unauthorized demo equipment requester.");
    const decision = Boolean(request.decidedBy && request.decidedAt);
    const checkout = Boolean(request.checkedOutBy && request.checkedOutAt && request.sourceLocationId && request.sourceLocationType);
    const returned = Boolean(request.returnedBy && request.returnedAt && request.returnNote && request.needsMaintenance !== undefined);
    if (Boolean(request.decidedBy) !== Boolean(request.decidedAt) || Boolean(request.checkedOutBy) !== Boolean(request.checkedOutAt) || Boolean(request.returnedBy) !== Boolean(request.returnedAt)) throw new Error("Incomplete demo equipment handover actor or timestamp.");
    if (request.status === "submitted" && (decision || checkout || returned)) throw new Error("Pending demo equipment request has a later transition.");
    if (request.status === "rejected" && (!decision || checkout || returned || !request.decisionNote || request.decisionNote.length < 3)) throw new Error("Invalid rejected demo equipment request.");
    if (["approved", "checked_out", "returned"].includes(request.status) && !decision) throw new Error("Equipment handover lacks approval.");
    if (request.status === "approved" && (checkout || returned || !request.sourceLocationId)) throw new Error("Invalid approved demo equipment request.");
    if (request.status === "checked_out" && (!checkout || returned || asset.status !== "assigned" || asset.location !== site.name)) throw new Error("Demo equipment custody does not match checkout.");
    if (request.status === "returned" && (!checkout || !returned)) throw new Error("Incomplete demo equipment return.");
    if (request.sourceLocationId && !(request.sourceLocationType === "warehouse" ? snapshot.tables.warehouses.some((row) => row.id === request.sourceLocationId) : snapshot.tables.sites.some((row) => row.id === request.sourceLocationId))) throw new Error("Invalid demo equipment source location.");
    for (const actorId of [request.decidedBy, request.checkedOutBy, request.returnedBy]) if (actorId && !isDemoManager(userById.get(actorId)?.role ?? "worker")) throw new Error("Unauthorized demo equipment handover actor.");
    if (["approved", "checked_out"].includes(request.status)) {
      if (activeEquipmentRequests.has(request.assetId)) throw new Error("An asset has more than one active demo handover.");
      activeEquipmentRequests.add(request.assetId);
    }
  }
  for (const asset of snapshot.tables.equipment) if ((asset.status === "assigned") !== snapshot.tables.equipmentRequests.some((row) => row.assetId === asset.id && row.status === "checked_out")) throw new Error("Demo assigned asset lacks a checked-out request.");
  for (const assignment of snapshot.tables.projectAssignments) if (!["project_manager", "engineer", "foreman"].includes(userById.get(assignment.userId)?.role ?? "")) throw new Error("Demo project assignment has an invalid role.");
  for (const membership of snapshot.tables.warehouseMemberships) if (userById.get(membership.userId)?.role !== "warehouse_staff") throw new Error("Demo warehouse membership has an invalid role.");
  const movementTotals = new Map<string, number>();
  for (const movement of snapshot.tables.transactions) {
    const key = `${movement.materialId}:${movement.warehouseId}`;
    movementTotals.set(key, (movementTotals.get(key) ?? 0) + quantityToMilli(movement.quantity));
  }
  const siteTotals = new Map<string, number>();
  for (const movement of snapshot.tables.requestMovements) {
    const request = snapshot.tables.materialRequests.find((row) => row.id === movement.requestId);
    if (!request || request.legacy || request.status !== "approved" || request.materialId !== movement.materialId || request.siteId !== movement.siteId || request.warehouseId !== movement.warehouseId) throw new Error("Demo request movement does not match its approved request.");
    const site = snapshot.tables.sites.find((row) => row.id === request.siteId);
    if (site?.projectId !== request.projectId) throw new Error("Demo request site does not belong to its project.");
    const actor = userById.get(movement.actorId);
    const authorized = actor && (isDemoManager(actor.role) || (movement.kind === "dispatch" ? actor.role === "warehouse_staff" && snapshot.tables.warehouseMemberships.some((row) => row.userId === actor.id && row.warehouseId === request.warehouseId) : ["project_manager", "engineer", "foreman"].includes(actor.role) && snapshot.tables.projectAssignments.some((row) => row.userId === actor.id && row.projectId === request.projectId)));
    if (!authorized) throw new Error("Demo request movement has an unauthorized actor.");
    const amount = quantityToMilli(movement.quantity);
    if (movement.kind === "dispatch") {
      const key = `${movement.materialId}:${movement.warehouseId}`;
      movementTotals.set(key, (movementTotals.get(key) ?? 0) - amount);
    } else {
      const key = `${movement.materialId}:${movement.siteId}`;
      siteTotals.set(key, (siteTotals.get(key) ?? 0) + (movement.kind === "receipt" ? amount : -amount));
    }
    if (movement.kind === "consumption") {
      if (movement.amountCentavos === undefined || movement.unitCostCentavos !== request.unitCostCentavos) throw new Error("Demo consumption lacks its cost snapshot.");
      const expected = Number((BigInt(amount) * BigInt(request.unitCostCentavos) + BigInt(500)) / BigInt(1000));
      if (movement.amountCentavos !== expected) throw new Error("Demo consumption cost does not reconcile.");
    } else if (movement.amountCentavos !== undefined || movement.unitCostCentavos !== undefined) throw new Error("Only consumption may post a project cost.");
  }
  for (const request of snapshot.tables.materialRequests) {
    if (request.legacy) continue;
    const site = snapshot.tables.sites.find((row) => row.id === request.siteId);
    if (site?.projectId !== request.projectId) throw new Error("Demo request site does not belong to its project.");
    const requester = userById.get(request.requestedBy);
    if (!requester || (!isDemoManager(requester.role) && !(["project_manager", "engineer", "foreman"].includes(requester.role) && snapshot.tables.projectAssignments.some((row) => row.userId === requester.id && row.projectId === request.projectId)))) throw new Error("Demo request has an unauthorized requester.");
    if (request.decidedBy && !isDemoManager(userById.get(request.decidedBy)?.role ?? "worker")) throw new Error("Demo request has an unauthorized decision actor.");
    if (request.status === "approved" ? request.approvedQuantity <= 0 || request.approvedQuantity > request.quantity || !request.decidedBy || !request.decidedAt : request.approvedQuantity !== 0) throw new Error("Invalid demo request decision.");
    if (request.status === "approved" && request.unitCostCentavos <= 0 || request.status !== "approved" && request.unitCostCentavos !== 0) throw new Error("Invalid demo request illustrative cost.");
    if (request.status === "rejected" && (!request.rejectionReason || !request.decidedBy || !request.decidedAt)) throw new Error("Rejected demo request needs a reason and actor.");
    if (request.status === "submitted" && (request.decidedBy || request.decidedAt)) throw new Error("Pending demo request cannot have a decision.");
    const movements = snapshot.tables.requestMovements.filter((row) => row.requestId === request.id);
    const dispatched = movements.filter((row) => row.kind === "dispatch").reduce((total, row) => total + quantityToMilli(row.quantity), 0);
    const received = movements.filter((row) => row.kind === "receipt").reduce((total, row) => total + quantityToMilli(row.quantity), 0);
    const consumed = movements.filter((row) => row.kind === "consumption").reduce((total, row) => total + quantityToMilli(row.quantity), 0);
    if (dispatched > quantityToMilli(request.approvedQuantity) || received > dispatched || consumed > received) throw new Error("Demo request quantities do not reconcile.");
  }
  for (const balance of snapshot.tables.balances) {
    const key = `${balance.materialId}:${balance.warehouseId}`;
    if ((movementTotals.get(key) ?? 0) !== quantityToMilli(balance.quantity)) throw new Error("Demo inventory balance does not match stock transactions.");
    movementTotals.delete(key);
  }
  if ([...movementTotals.values()].some((value) => value !== 0)) throw new Error("Demo inventory transaction has no balance record.");
  for (const balance of snapshot.tables.siteBalances) {
    const key = `${balance.materialId}:${balance.siteId}`;
    if ((siteTotals.get(key) ?? 0) !== quantityToMilli(balance.quantity)) throw new Error("Demo site balance does not match request movements.");
    siteTotals.delete(key);
  }
  if ([...siteTotals.values()].some((value) => value !== 0)) throw new Error("Demo request movement has no site balance.");
  return snapshot;
}
