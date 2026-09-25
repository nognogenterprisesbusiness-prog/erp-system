import Dexie, { type Table } from "dexie";
import { canAssignInitialRole, canManageAccount } from "@/lib/users/access";

import { createDemoSeed } from "./seed";
import {
  DEMO_SCHEMA_VERSION,
  demoEquipmentInputSchema,
  demoEquipmentRequestInputSchema,
  demoEmployeePhotoSchema,
  demoMaterialInputSchema,
  demoSchemas,
  demoStockInInputSchema,
  demoUserInputSchema,
  demoProfileInputSchema,
  demoWarehouseInputSchema,
  demoProjectInputSchema,
  demoMaterialPlanInputSchema,
  demoSupplierInputSchema,
  demoSupplierPriceInputSchema,
  demoDailyReportInputSchema,
  demoEmployeeInputSchema,
  demoEmployeeAssignmentInputSchema,
  demoAttendanceInputSchema,
  demoRequestInputSchema,
  demoRequestDecisionSchema,
  demoRequestMovementInputSchema,
  demoProjectAssignmentInputSchema,
  demoWarehouseMembershipInputSchema,
  quantityToMilli,
  milliToQuantity,
  demoManagerRoles,
  isDemoManager,
  demoTableNames,
  validateDemoSnapshot,
  type DemoData,
  type DemoEquipmentInput,
  type DemoEquipmentRequestInput,
  type DemoMaterialInput,
  type DemoSnapshot,
  type DemoStockInInput,
  type DemoUserInput,
  type DemoWarehouseInput,
  type DemoProjectInput,
  type DemoMaterialPlanInput,
  type DemoSupplierInput,
  type DemoDailyReportInput,
  type DemoEmployeeInput,
  type DemoEmployeeAssignmentInput,
  type DemoAttendanceInput,
  type DemoRequestInput,
  type DemoRequestDecision,
  type DemoRequestMovementInput,
  type DemoProjectAssignmentInput,
  type DemoWarehouseMembershipInput,
  type DemoTable,
} from "./schema";
import { summarizeDemoMovements, type ActiveDemoRequest } from "./workflow";

type MetaRow = { key: string; value: number | string };
type SavedSnapshotRow = { key: "primary"; savedAt: string; selectedUserId: string; snapshot: DemoSnapshot };
const notificationSeedKey = "demoNotificationSeedV2";
const employeePhotoSeedKey = "demoEmployeePhotoSeedV1";
const employeeContactSeedKey = "demoEmployeeContactsV1";
const employeeWageSeedKey = "demoEmployeeWagesV1";
const projectPhotoSeedKey = "demoProjectPhotosV1";
const warehousePhotoSeedKey = "demoWarehousePhotosV1";
const reportPhotoSeedKey = "demoDailyReportPhotosV1";
const materialPhotoSeedKey = "demoMaterialPhotosV1";
const automaticQrSeedKey = "demoAutomaticQrV1";
const equipmentSkuSeedKey = "demoEquipmentSkuV1";
const userContactSeedKey = "demoUserContactV2";
const workerSeedKey = "demoWorkerPersonaV1";
const supplierPriceSeedKey = "demoSupplierPricesV1";
const materialPlanSeedKey = "demoMaterialPlanV1";
const projectFinanceSeedKey = "demoProjectFinanceV1";
const projectScheduleSeedKey = "demoProjectScheduleV1";
const reportProgressSeedKey = "demoReportProgressV1";
const attendanceAssignmentSeedKey = "demoAttendanceAssignmentsV1";

export class DemoDatabase extends Dexie {
  meta!: Table<MetaRow, string>;
  snapshots!: Table<SavedSnapshotRow, string>;
  auditLogs!: Table<DemoData["auditLogs"][number], string>;

  constructor(name = "nognog_erp_demo") {
    super(name);
    this.version(1).stores({
      meta: "key",
      users: "id,role",
      projects: "id,status",
      sites: "id,projectId",
      warehouses: "id",
      materials: "id,code",
      balances: "id,[materialId+warehouseId]",
      transactions: "id,materialId,warehouseId",
      materialRequests: "id,projectId",
      equipment: "id,status",
      employees: "id",
      attendance: "id,employeeId,projectId",
      suppliers: "id",
      purchaseOrders: "id,supplierId",
      dailyReports: "id,projectId",
      projectExpenses: "id,projectId",
      notifications: "id,userId",
    });
    this.version(2).stores({ snapshots: "key" });
    this.version(3).stores({
      projectAssignments: "id,[userId+projectId],projectId",
      warehouseMemberships: "id,[userId+warehouseId],warehouseId",
      siteBalances: "id,[materialId+siteId]",
      requestMovements: "id,requestId,materialId",
    });
    this.version(4).stores({ auditLogs: "id,createdAt,actorId,entity,action" });
    this.version(5).stores({ qrCodes: "id,identifier,[entityType+entityId],createdAt" });
    this.version(6).stores({ equipmentRequests: "id,assetId,projectId,status,createdAt" });
    this.version(7).stores({ supplierPrices: "id,supplierId,materialId,[supplierId+materialId],effectiveOn" });
    this.version(8).stores({ projectMaterialPlans: "id,projectId,siteId,warehouseId,materialId,[siteId+materialId]" });
    this.version(9).stores({ employeeAssignments: "id,employeeId,projectId,siteId,[employeeId+projectId]", attendanceReversals: "id,attendanceId" });
  }
}

let browserDatabase: DemoDatabase | undefined;

export function getDemoDatabase(): DemoDatabase {
  if (typeof window === "undefined" || !window.indexedDB) {
    throw new Error("Local demo storage is unavailable in this browser. No live data was accessed.");
  }
  browserDatabase ??= new DemoDatabase();
  return browserDatabase;
}

function demoTable<K extends DemoTable>(db: DemoDatabase, name: K): Table<DemoData[K][number], string> {
  return db.table<DemoData[K][number], string>(name);
}

async function ensureDemoQr(db: DemoDatabase, entityType: DemoData["qrCodes"][number]["entityType"], entityId: string, actorId: string): Promise<string> {
  const codes = demoTable(db, "qrCodes");
  const existing = await codes.where("[entityType+entityId]").equals([entityType, entityId]).first();
  if (existing) return existing.id;
  const code = demoSchemas.qrCodes.parse({ id: `demo-qr-${crypto.randomUUID()}`, identifier: `NQ-${crypto.randomUUID().replaceAll("-", "").toUpperCase()}`, entityType, entityId, actorId, createdAt: new Date().toISOString() });
  await codes.add(code);
  return code.id;
}

async function ensureAllDemoQr(db: DemoDatabase): Promise<void> {
  const actorId = (await demoTable(db, "users").toArray())[0]?.id;
  if (!actorId) return;
  for (const [type, table] of [["material", "materials"], ["equipment", "equipment"], ["warehouse", "warehouses"], ["project_site", "sites"]] as const) {
    for (const record of await demoTable(db, table).toArray()) await ensureDemoQr(db, type, record.id, actorId);
  }
}

async function replaceData(db: DemoDatabase, snapshot: DemoSnapshot, selectedUserId: string): Promise<void> {
  await db.transaction("rw", db.tables, async () => {
    for (const name of demoTableNames) {
      const table = demoTable(db, name);
      await table.clear();
      await table.bulkPut(snapshot.tables[name] as DemoData[typeof name][number][]);
    }
    await ensureAllDemoQr(db);
    await db.meta.put({ key: "schemaVersion", value: DEMO_SCHEMA_VERSION });
    await db.meta.put({ key: "selectedUserId", value: selectedUserId });
  });
}

export async function initializeDemo(db: DemoDatabase): Promise<void> {
  await db.transaction("rw", db.tables, async () => {
    const version = await db.meta.get("schemaVersion");
    if (version) {
      if (version.value === 1) {
        const tables = {} as DemoData;
        for (const name of demoTableNames) (tables as unknown as Record<string, unknown>)[name] = await demoTable(db, name).toArray();
        const upgraded = validateDemoSnapshot({ schemaVersion: 1, exportedAt: new Date().toISOString(), tables });
        for (const name of ["materialRequests", "projectAssignments", "warehouseMemberships", "siteBalances", "requestMovements"] as const) {
          await demoTable(db, name).clear();
          await demoTable(db, name).bulkPut(upgraded.tables[name] as DemoData[typeof name][number][]);
        }
        await db.meta.put({ key: "schemaVersion", value: DEMO_SCHEMA_VERSION });
        version.value = DEMO_SCHEMA_VERSION;
      }
      if (version.value === 2) {
        await db.meta.put({ key: "schemaVersion", value: DEMO_SCHEMA_VERSION });
        version.value = DEMO_SCHEMA_VERSION;
      }
      if (version.value === 3) {
        await db.meta.put({ key: "schemaVersion", value: DEMO_SCHEMA_VERSION });
        version.value = DEMO_SCHEMA_VERSION;
      }
      if (version.value === 4) {
        await db.meta.put({ key: "schemaVersion", value: DEMO_SCHEMA_VERSION });
        version.value = DEMO_SCHEMA_VERSION;
      }
      if (version.value === 5) {
        await db.meta.put({ key: "schemaVersion", value: DEMO_SCHEMA_VERSION });
        version.value = DEMO_SCHEMA_VERSION;
      }
      if (version.value === 6) {
        await db.meta.put({ key: "schemaVersion", value: DEMO_SCHEMA_VERSION });
        version.value = DEMO_SCHEMA_VERSION;
      }
      if (version.value === 7) {
        await db.meta.put({ key: "schemaVersion", value: DEMO_SCHEMA_VERSION });
        version.value = DEMO_SCHEMA_VERSION;
      }
      if (version.value !== DEMO_SCHEMA_VERSION) throw new Error("Demo data uses an unsupported schema version. Export it before updating.");
      if (!(await db.meta.get(notificationSeedKey))) {
        const notifications = demoTable(db, "notifications");
        const users = demoTable(db, "users");
        for (const item of createDemoSeed().tables.notifications) {
          if (await users.get(item.userId) && !(await notifications.get(item.id))) await notifications.put(item);
        }
        await db.meta.put({ key: notificationSeedKey, value: 1 });
      }
      if (!(await db.meta.get(employeePhotoSeedKey))) {
        const employees = demoTable(db, "employees");
        const mason = await employees.get("demo-employee-mason");
        if (mason && !mason.photo) await employees.update(mason.id, { photo: "/demo-employee-mason.webp" });
        await db.meta.put({ key: employeePhotoSeedKey, value: 1 });
      }
      if (!(await db.meta.get(employeeContactSeedKey))) {
        const employees = demoTable(db, "employees");
        for (const sample of createDemoSeed().tables.employees) {
          const current = await employees.get(sample.id);
          if (current) await employees.update(sample.id, {
            contactNumber: current.contactNumber ?? sample.contactNumber,
            email: current.email ?? sample.email,
          });
        }
        await db.meta.put({ key: employeeContactSeedKey, value: 1 });
      }
      if (!(await db.meta.get(employeeWageSeedKey))) {
        const employees = demoTable(db, "employees");
        for (const sample of createDemoSeed().tables.employees) {
          const current = await employees.get(sample.id);
          if (current && current.dailyWageCentavos === undefined && sample.dailyWageCentavos !== undefined) await employees.update(current.id, { dailyWageCentavos: sample.dailyWageCentavos });
        }
        await db.meta.put({ key: employeeWageSeedKey, value: 1 });
      }
      if (!(await db.meta.get(projectPhotoSeedKey))) {
        const projects = demoTable(db, "projects");
        for (const sample of createDemoSeed().tables.projects) {
          const current = await projects.get(sample.id);
          if (current && !current.photo) await projects.update(sample.id, { photo: sample.photo });
        }
        await db.meta.put({ key: projectPhotoSeedKey, value: 1 });
      }
      if (!(await db.meta.get(projectFinanceSeedKey))) {
        const projects = demoTable(db, "projects");
        for (const sample of createDemoSeed().tables.projects) {
          const current = await projects.get(sample.id);
          if (current) await projects.update(current.id, {
            initialBudgetCentavos: current.initialBudgetCentavos ?? sample.initialBudgetCentavos,
            contractValueCentavos: current.contractValueCentavos ?? sample.contractValueCentavos,
          });
        }
        await db.meta.put({ key: projectFinanceSeedKey, value: 1 });
      }
      if (!(await db.meta.get(projectScheduleSeedKey))) {
        const projects = demoTable(db, "projects");
        for (const sample of createDemoSeed().tables.projects) {
          const current = await projects.get(sample.id);
          if (current) await projects.update(current.id, {
            startDate: current.startDate ?? sample.startDate,
            targetCompletionDate: current.targetCompletionDate ?? sample.targetCompletionDate,
          });
        }
        await db.meta.put({ key: projectScheduleSeedKey, value: 1 });
      }
      if (!(await db.meta.get(warehousePhotoSeedKey))) {
        const warehouses = demoTable(db, "warehouses");
        for (const sample of createDemoSeed().tables.warehouses) {
          const current = await warehouses.get(sample.id);
          if (current && !current.photo) await warehouses.update(sample.id, { photo: sample.photo });
        }
        await db.meta.put({ key: warehousePhotoSeedKey, value: 1 });
      }
      if (!(await db.meta.get(reportPhotoSeedKey))) {
        const reports = demoTable(db, "dailyReports");
        for (const sample of createDemoSeed().tables.dailyReports) {
          const current = await reports.get(sample.id);
          if (current && !current.photo) await reports.update(sample.id, { photo: sample.photo });
        }
        await db.meta.put({ key: reportPhotoSeedKey, value: 1 });
      }
      if (!(await db.meta.get(reportProgressSeedKey))) {
        const reports = demoTable(db, "dailyReports");
        for (const sample of createDemoSeed().tables.dailyReports) {
          const current = await reports.get(sample.id);
          if (current && current.progressPercent === undefined) await reports.update(current.id, { progressPercent: sample.progressPercent });
        }
        await db.meta.put({ key: reportProgressSeedKey, value: 1 });
      }
      if (!(await db.meta.get(materialPhotoSeedKey))) {
        const materials = demoTable(db, "materials");
        for (const sample of createDemoSeed().tables.materials) {
          const current = await materials.get(sample.id);
          if (current && !current.photo) await materials.update(sample.id, { photo: sample.photo });
        }
        await db.meta.put({ key: materialPhotoSeedKey, value: 1 });
      }
      if (!(await db.meta.get(automaticQrSeedKey))) {
        await ensureAllDemoQr(db);
        await db.meta.put({ key: automaticQrSeedKey, value: 1 });
      }
      if (!(await db.meta.get(equipmentSkuSeedKey))) {
        const equipment = demoTable(db, "equipment");
        for (const sample of createDemoSeed().tables.equipment) {
          const current = await equipment.get(sample.id);
          if (current && !current.sku) await equipment.update(sample.id, { sku: sample.sku });
        }
        await db.meta.put({ key: equipmentSkuSeedKey, value: 1 });
      }
      if (!(await db.meta.get(userContactSeedKey))) {
        const users = demoTable(db, "users");
        for (const sample of createDemoSeed().tables.users) {
          const current = await users.get(sample.id);
          if (current) await users.update(sample.id, { email: current.email ?? sample.email, phone: current.phone ?? sample.phone });
        }
        await db.meta.put({ key: userContactSeedKey, value: 1 });
      }
      if (!(await db.meta.get(workerSeedKey))) {
        const sample = createDemoSeed();
        const worker = sample.tables.users.find((user) => user.id === "demo-user-worker");
        if (worker && !(await demoTable(db, "users").get(worker.id)) && !(await demoTable(db, "users").toArray()).some((user) => user.email?.toLowerCase() === worker.email?.toLowerCase())) await demoTable(db, "users").put(worker);
        const notice = sample.tables.notifications.find((item) => item.id === "demo-notification-worker");
        if (notice && await demoTable(db, "users").get(notice.userId) && !(await demoTable(db, "notifications").get(notice.id))) await demoTable(db, "notifications").put(notice);
        const mason = await demoTable(db, "employees").get("demo-employee-mason");
        if (mason && !mason.userId && await demoTable(db, "users").get("demo-user-worker")) await demoTable(db, "employees").update(mason.id, { userId: "demo-user-worker" });
        const attendance = sample.tables.attendance.find((item) => item.id === "demo-attendance-mason");
        if (attendance && mason && await demoTable(db, "projects").get(attendance.projectId) && !(await demoTable(db, "attendance").get(attendance.id))) await demoTable(db, "attendance").put(attendance);
        await db.meta.put({ key: workerSeedKey, value: 1 });
      }
      if (!(await db.meta.get(supplierPriceSeedKey))) {
        for (const sample of createDemoSeed().tables.supplierPrices) {
          if (await demoTable(db, "suppliers").get(sample.supplierId) && await demoTable(db, "materials").get(sample.materialId) && await demoTable(db, "users").get(sample.recordedBy) && !(await demoTable(db, "supplierPrices").get(sample.id))) await demoTable(db, "supplierPrices").put(sample);
        }
        await db.meta.put({ key: supplierPriceSeedKey, value: 1 });
      }
      if (!(await db.meta.get(materialPlanSeedKey))) {
        for (const sample of createDemoSeed().tables.projectMaterialPlans) {
          const existing = await demoTable(db, "projectMaterialPlans").where("[siteId+materialId]").equals([sample.siteId, sample.materialId]).first();
          if (!existing && await demoTable(db, "projects").get(sample.projectId) && await demoTable(db, "sites").get(sample.siteId) && await demoTable(db, "warehouses").get(sample.warehouseId) && await demoTable(db, "materials").get(sample.materialId)) await demoTable(db, "projectMaterialPlans").put(sample);
        }
        await db.meta.put({ key: materialPlanSeedKey, value: 1 });
      }
      if (!(await db.meta.get(attendanceAssignmentSeedKey))) {
        const assignments = demoTable(db, "employeeAssignments");
        for (const sample of createDemoSeed().tables.employeeAssignments) {
          if (await demoTable(db, "employees").get(sample.employeeId) && await demoTable(db, "projects").get(sample.projectId) && await demoTable(db, "sites").get(sample.siteId) && !(await assignments.get(sample.id))) await assignments.put(sample);
        }
        await db.meta.put({ key: attendanceAssignmentSeedKey, value: 1 });
      }
      return;
    }
    const counts = await Promise.all(demoTableNames.map((name) => demoTable(db, name).count()));
    if (counts.some(Boolean)) throw new Error("Incomplete demo data found. Reset it explicitly to restore the seed.");
    const seed = validateDemoSnapshot(createDemoSeed());
    for (const name of demoTableNames) await demoTable(db, name).bulkPut(seed.tables[name] as DemoData[typeof name][number][]);
    await ensureAllDemoQr(db);
    await db.meta.put({ key: "schemaVersion", value: DEMO_SCHEMA_VERSION });
    await db.meta.put({ key: "selectedUserId", value: seed.tables.users[0].id });
    await db.meta.put({ key: notificationSeedKey, value: 1 });
    await db.meta.put({ key: employeePhotoSeedKey, value: 1 });
    await db.meta.put({ key: employeeContactSeedKey, value: 1 });
    await db.meta.put({ key: projectPhotoSeedKey, value: 1 });
    await db.meta.put({ key: projectFinanceSeedKey, value: 1 });
    await db.meta.put({ key: projectScheduleSeedKey, value: 1 });
    await db.meta.put({ key: warehousePhotoSeedKey, value: 1 });
    await db.meta.put({ key: reportPhotoSeedKey, value: 1 });
    await db.meta.put({ key: reportProgressSeedKey, value: 1 });
    await db.meta.put({ key: materialPhotoSeedKey, value: 1 });
    await db.meta.put({ key: automaticQrSeedKey, value: 1 });
    await db.meta.put({ key: equipmentSkuSeedKey, value: 1 });
    await db.meta.put({ key: userContactSeedKey, value: 1 });
    await db.meta.put({ key: workerSeedKey, value: 1 });
    await db.meta.put({ key: supplierPriceSeedKey, value: 1 });
    await db.meta.put({ key: materialPlanSeedKey, value: 1 });
    await db.meta.put({ key: attendanceAssignmentSeedKey, value: 1 });
  });
}

export async function readDemo(db: DemoDatabase): Promise<{ snapshot: DemoSnapshot; selectedUserId: string }> {
  await initializeDemo(db);
  return db.transaction("r", db.tables, async () => {
    const tables = {} as DemoData;
    for (const name of demoTableNames) {
      (tables as unknown as Record<string, unknown>)[name] = await demoTable(db, name).toArray();
    }
    const selected = await db.meta.get("selectedUserId");
    const snapshot = validateDemoSnapshot({ schemaVersion: DEMO_SCHEMA_VERSION, exportedAt: new Date().toISOString(), tables });
    const selectedUserId = typeof selected?.value === "string" && snapshot.tables.users.some((user) => user.id === selected.value && user.isActive !== false)
      ? selected.value : snapshot.tables.users.find((user) => isDemoManager(user.role) && user.isActive !== false)!.id;
    return { snapshot, selectedUserId };
  });
}

export async function selectDemoUser(db: DemoDatabase, userId: string): Promise<void> {
  await initializeDemo(db);
  const user = await demoTable(db, "users").get(userId);
  if (!user || user.isActive === false) throw new Error("This account is unavailable.");
  await db.meta.put({ key: "selectedUserId", value: userId });
}

export async function markDemoNotificationRead(db: DemoDatabase, notificationId: string, userId: string): Promise<void> {
  await initializeDemo(db);
  const table = demoTable(db, "notifications");
  await db.transaction("rw", table, async () => {
    const notification = await table.get(notificationId);
    if (!notification || notification.userId !== userId) throw new Error("Notification is unavailable for this demo account.");
    await table.update(notificationId, { read: true });
  });
}

export async function markDemoNotificationsUnread(db: DemoDatabase, userId: string): Promise<number> {
  await initializeDemo(db);
  const table = demoTable(db, "notifications");
  return db.transaction("rw", table, db.meta, demoTable(db, "users"), async () => {
    const selected = await selectedDemoActor(db);
    if (selected.id !== userId) throw new Error("Notifications are unavailable for this demo account.");
    return table.where("userId").equals(userId).filter((notification) => notification.read).modify({ read: false });
  });
}

async function requireDemoRole(db: DemoDatabase, roles: DemoData["users"][number]["role"][]): Promise<void> {
  const selected = await db.meta.get("selectedUserId");
  const user = typeof selected?.value === "string" ? await demoTable(db, "users").get(selected.value) : undefined;
  if (!user || user.isActive === false || !roles.includes(user.role)) throw new Error("This demo role cannot make that change.");
}

async function selectedDemoActor(db: DemoDatabase): Promise<DemoData["users"][number]> {
  const selected = await db.meta.get("selectedUserId");
  const user = typeof selected?.value === "string" ? await demoTable(db, "users").get(selected.value) : undefined;
  if (!user || user.isActive === false) throw new Error("This account is unavailable.");
  return user;
}

async function appendDemoAudit(db: DemoDatabase, actorId: string, entity: string, recordId: string, action: DemoData["auditLogs"][number]["action"], detail: string): Promise<void> {
  await demoTable(db, "auditLogs").add(demoSchemas.auditLogs.parse({ id: `demo-audit-${crypto.randomUUID()}`, actorId, entity, recordId, action, detail, createdAt: new Date().toISOString() }));
}

async function requireProjectAccess(db: DemoDatabase, user: DemoData["users"][number], projectId: string): Promise<void> {
  if (isDemoManager(user.role)) return;
  if (!["project_manager", "engineer", "foreman"].includes(user.role) || !(await demoTable(db, "projectAssignments").where("[userId+projectId]").equals([user.id, projectId]).first())) throw new Error("This demo role is not assigned to that project.");
}

async function requireWarehouseAccess(db: DemoDatabase, user: DemoData["users"][number], warehouseId: string): Promise<void> {
  if (isDemoManager(user.role)) return;
  if (user.role !== "warehouse_staff" || !(await demoTable(db, "warehouseMemberships").where("[userId+warehouseId]").equals([user.id, warehouseId]).first())) throw new Error("This demo role cannot handle that warehouse.");
}

export async function registerDemoUser(db: DemoDatabase, input: DemoUserInput): Promise<void> {
  const parsed = demoUserInputSchema.parse(input);
  await initializeDemo(db);
  const users = demoTable(db, "users");
  await db.transaction("rw", users, db.auditLogs, db.meta, async () => {
      const actor = await selectedDemoActor(db);
      if (!canAssignInitialRole([actor.role], parsed.role)) throw new Error("This demo role cannot create that account role.");
    if ((await users.toArray()).some((user) => user.email?.toLowerCase() === parsed.email.toLowerCase())) throw new Error("This demo email is already in use.");
    const created = demoSchemas.users.parse({ id: `demo-user-${crypto.randomUUID()}`, ...parsed, isActive: true });
    await users.add(created);
    await appendDemoAudit(db, actor.id, "users", created.id, "create", `Added ${created.name} as ${created.role.replaceAll("_", " ")}`);
  });
}

export async function setDemoUserActive(db: DemoDatabase, userId: string, isActive: boolean): Promise<void> {
  await initializeDemo(db);
  const users = demoTable(db, "users");
  await db.transaction("rw", users, db.auditLogs, db.meta, async () => {
      const actor = await selectedDemoActor(db);
      const target = await users.get(userId);
      if (!target || !canManageAccount(actor.id, [actor.role], target.id, [target.role])) throw new Error("You cannot change this user.");
    if (!isActive && isDemoManager(target.role) && !(await users.toArray()).some((user) => user.id !== userId && isDemoManager(user.role) && user.isActive !== false)) throw new Error("Keep at least one active manager.");
    await users.update(userId, { isActive });
    await appendDemoAudit(db, actor.id, "users", userId, "update", `${isActive ? "Enabled" : "Disabled"} ${target.name}`);
  });
}

export async function updateDemoProfile(db: DemoDatabase, input: unknown): Promise<void> {
  const parsed = demoProfileInputSchema.parse(input);
  await initializeDemo(db);
  const users = demoTable(db, "users");
  await db.transaction("rw", users, db.auditLogs, db.meta, async () => {
    const actor = await selectedDemoActor(db);
    if ((await users.toArray()).some((user) => user.id !== actor.id && user.email?.toLowerCase() === parsed.email.toLowerCase())) throw new Error("That email is already used by another demo account.");
    await users.update(actor.id, { name: parsed.name, email: parsed.email, phone: parsed.phone, ...(parsed.photo ? { photo: parsed.photo } : {}) });
    await appendDemoAudit(db, actor.id, "users", actor.id, "update", "Updated own profile");
  });
}

export async function generateDemoQr(db: DemoDatabase, entityType: "material" | "equipment" | "warehouse" | "project_site", entityId: string): Promise<string> {
  await initializeDemo(db);
  return db.transaction("rw", db.tables, async () => {
    const actor = await selectedDemoActor(db);
    if (!isDemoManager(actor.role)) throw new Error("Only a manager can generate a QR label.");
    const targetTable = entityType === "material" ? "materials" : entityType === "equipment" ? "equipment" : entityType === "warehouse" ? "warehouses" : "sites";
    if (!(await demoTable(db, targetTable).get(entityId))) throw new Error("The selected record is unavailable.");
    return ensureDemoQr(db, entityType, entityId, actor.id);
  });
}

export async function registerDemoMaterial(db: DemoDatabase, input: DemoMaterialInput): Promise<void> {
  const parsed = demoMaterialInputSchema.parse(input);
  const code = parsed.code.toUpperCase();
  await initializeDemo(db);
  await db.transaction("rw", db.tables, async () => {
    const actor = await selectedDemoActor(db);
    if (!isDemoManager(actor.role)) throw new Error("This demo role cannot make that change.");
    const materials = demoTable(db, "materials");
    if (await materials.where("code").equalsIgnoreCase(code).first()) throw new Error("A material with this code already exists.");
    if (!(await demoTable(db, "warehouses").get(parsed.warehouseId))) throw new Error("Choose an existing warehouse.");
    const materialId = `demo-material-${crypto.randomUUID()}`;
    const material = demoSchemas.materials.parse({ id: materialId, code, name: parsed.name, unit: parsed.unit, photo: parsed.photo });
    const balance = demoSchemas.balances.parse({ id: `demo-balance-${crypto.randomUUID()}`, materialId, warehouseId: parsed.warehouseId, quantity: parsed.quantity });
    await materials.add(material);
    await ensureDemoQr(db, "material", materialId, actor.id);
    await demoTable(db, "balances").add(balance);
    if (parsed.quantity > 0) await demoTable(db, "transactions").add(demoSchemas.transactions.parse({ id: `demo-transaction-${crypto.randomUUID()}`, materialId, warehouseId: parsed.warehouseId, quantity: parsed.quantity, kind: "opening_balance", date: new Date().toISOString().slice(0, 10) }));
    await appendDemoAudit(db, actor.id, "materials", materialId, "create", `Added ${material.code} · ${material.name}${parsed.quantity ? ` with ${parsed.quantity} ${material.unit} opening stock` : ""}`);
  });
}

export async function registerDemoWarehouse(db: DemoDatabase, input: DemoWarehouseInput): Promise<void> {
  const parsed = demoWarehouseInputSchema.parse(input);
  await initializeDemo(db);
  const warehouses = demoTable(db, "warehouses");
  await db.transaction("rw", warehouses, demoTable(db, "users"), demoTable(db, "qrCodes"), db.auditLogs, db.meta, async () => {
    const actor = await selectedDemoActor(db);
    if (!isDemoManager(actor.role)) throw new Error("This demo role cannot make that change.");
    if ((await warehouses.toArray()).some((warehouse) => warehouse.name.toLocaleLowerCase() === parsed.name.toLocaleLowerCase())) throw new Error("A warehouse with this name already exists.");
    const created = demoSchemas.warehouses.parse({ id: `demo-warehouse-${crypto.randomUUID()}`, ...parsed });
    await warehouses.add(created);
    await ensureDemoQr(db, "warehouse", created.id, actor.id);
    await appendDemoAudit(db, actor.id, "warehouses", created.id, "create", `Added ${created.name}`);
  });
}

export async function registerDemoProject(db: DemoDatabase, input: DemoProjectInput): Promise<void> {
  const parsed = demoProjectInputSchema.parse(input);
  if (parsed.startDate && parsed.targetCompletionDate && parsed.targetCompletionDate < parsed.startDate) throw new Error("Target completion cannot be before the start date.");
  const code = parsed.code.toUpperCase();
  await initializeDemo(db);
  const projects = demoTable(db, "projects");
  const sites = demoTable(db, "sites");
  await db.transaction("rw", [projects, sites, demoTable(db, "users"), demoTable(db, "qrCodes"), db.auditLogs, db.meta], async () => {
    const actor = await selectedDemoActor(db);
    if (!isDemoManager(actor.role)) throw new Error("This demo role cannot make that change.");
    if ((await projects.toArray()).some((project) => project.code.toLowerCase() === code.toLowerCase())) throw new Error("A project with this code already exists.");
    const projectId = `demo-project-${crypto.randomUUID()}`;
    await projects.add(demoSchemas.projects.parse({ id: projectId, code, name: parsed.name, status: parsed.status, location: parsed.location, municipalityCode: parsed.municipalityCode, address: parsed.address, startDate: parsed.startDate, targetCompletionDate: parsed.targetCompletionDate, photo: parsed.photo, contractValueCentavos: parsed.contractValueCentavos, initialBudgetCentavos: parsed.initialBudgetCentavos }));
    const site = demoSchemas.sites.parse({ id: `demo-site-${crypto.randomUUID()}`, projectId, name: parsed.siteName });
    await sites.add(site);
    await ensureDemoQr(db, "project_site", site.id, actor.id);
    await appendDemoAudit(db, actor.id, "projects", projectId, "create", `Added ${code} · ${parsed.name}`);
  });
}

export async function saveDemoMaterialPlan(db: DemoDatabase, input: DemoMaterialPlanInput): Promise<void> {
  const parsed = demoMaterialPlanInputSchema.parse(input);
  await initializeDemo(db);
  await db.transaction("rw", db.tables, async () => {
    const actor = await selectedDemoActor(db);
    const assignedManager = actor.role === "project_manager" && Boolean(await demoTable(db, "projectAssignments").where("[userId+projectId]").equals([actor.id, parsed.projectId]).first());
    if (!isDemoManager(actor.role) && !assignedManager) throw new Error("Only an administrator or assigned project manager can manage a material plan.");
    const project = await demoTable(db, "projects").get(parsed.projectId);
    const site = await demoTable(db, "sites").get(parsed.siteId);
    if (!project || project.status !== "active" || !site || site.projectId !== project.id) throw new Error("Choose an active project and its site.");
    if (!(await demoTable(db, "warehouses").get(parsed.warehouseId)) || !(await demoTable(db, "materials").get(parsed.materialId))) throw new Error("Choose an existing warehouse and material.");
    const plans = demoTable(db, "projectMaterialPlans");
    const current = parsed.id ? await plans.get(parsed.id) : undefined;
    if (parsed.id && (!current || current.projectId !== project.id)) throw new Error("Material plan entry is unavailable.");
    const duplicate = await plans.where("[siteId+materialId]").equals([parsed.siteId, parsed.materialId]).first();
    if (duplicate && duplicate.id !== parsed.id) throw new Error("This material is already planned for that site. Edit its quantity or source warehouse instead.");
    const saved = demoSchemas.projectMaterialPlans.parse({ ...parsed, id: parsed.id ?? `demo-plan-${crypto.randomUUID()}` });
    await plans.put(saved);
    await appendDemoAudit(db, actor.id, "projectMaterialPlans", saved.id, current ? "update" : "create", `${current ? "Updated" : "Planned"} ${saved.plannedQuantity} units for project`);
  });
}

export async function deleteDemoMaterialPlan(db: DemoDatabase, planId: string): Promise<void> {
  await initializeDemo(db);
  await db.transaction("rw", db.tables, async () => {
    const actor = await selectedDemoActor(db);
    const plans = demoTable(db, "projectMaterialPlans");
    const plan = await plans.get(planId);
    if (!plan) throw new Error("Material plan entry is unavailable.");
    const assignedManager = actor.role === "project_manager" && Boolean(await demoTable(db, "projectAssignments").where("[userId+projectId]").equals([actor.id, plan.projectId]).first());
    if (!isDemoManager(actor.role) && !assignedManager) throw new Error("Only an administrator or assigned project manager can manage a material plan.");
    await plans.delete(planId);
    await appendDemoAudit(db, actor.id, "projectMaterialPlans", planId, "delete", "Removed planned material entry");
  });
}

export async function registerDemoSupplier(db: DemoDatabase, input: DemoSupplierInput): Promise<void> {
  const parsed = demoSupplierInputSchema.parse(input);
  await initializeDemo(db);
  const suppliers = demoTable(db, "suppliers");
  await db.transaction("rw", suppliers, demoTable(db, "users"), db.auditLogs, db.meta, async () => {
    const actor = await selectedDemoActor(db);
    if (!isDemoManager(actor.role)) throw new Error("This demo role cannot make that change.");
    if ((await suppliers.toArray()).some((supplier) => supplier.name.toLowerCase() === parsed.name.toLowerCase())) throw new Error("This supplier already exists.");
    const created = demoSchemas.suppliers.parse({ id: `demo-supplier-${crypto.randomUUID()}`, ...parsed });
    await suppliers.add(created);
    await appendDemoAudit(db, actor.id, "suppliers", created.id, "create", `Added ${created.name}`);
  });
}

export async function recordDemoSupplierPrice(db: DemoDatabase, input: unknown): Promise<void> {
  const parsed = demoSupplierPriceInputSchema.parse(input);
  await initializeDemo(db);
  await db.transaction("rw", db.tables, async () => {
    const actor = await selectedDemoActor(db);
    if (!isDemoManager(actor.role)) throw new Error("Only a manager can record supplier prices.");
    if (!(await demoTable(db, "suppliers").get(parsed.supplierId)) || !(await demoTable(db, "materials").get(parsed.materialId))) throw new Error("Choose an existing supplier and material.");
    const history = await demoTable(db, "supplierPrices").where("[supplierId+materialId]").equals([parsed.supplierId, parsed.materialId]).toArray();
    if (history.some((price) => price.effectiveOn === parsed.effectiveOn)) throw new Error("A price already exists for this supplier, material and date.");
    const record = demoSchemas.supplierPrices.parse({ id: `demo-price-${crypto.randomUUID()}`, ...parsed, recordedBy: actor.id, createdAt: new Date().toISOString() });
    await demoTable(db, "supplierPrices").add(record);
    await appendDemoAudit(db, actor.id, "supplierPrices", record.id, "create", `Recorded supplier price for ${parsed.effectiveOn}`);
  });
}

export async function registerDemoDailyReport(db: DemoDatabase, input: DemoDailyReportInput): Promise<void> {
  const parsed = demoDailyReportInputSchema.parse(input);
  await initializeDemo(db);
  const reports = demoTable(db, "dailyReports");
  await db.transaction("rw", [reports, demoTable(db, "projects"), demoTable(db, "projectAssignments"), demoTable(db, "users"), db.auditLogs, db.meta], async () => {
    const actor = await selectedDemoActor(db);
    await requireProjectAccess(db, actor, parsed.projectId);
    if (!(await demoTable(db, "projects").get(parsed.projectId))) throw new Error("Choose an existing project.");
    const created = demoSchemas.dailyReports.parse({ id: `demo-report-${crypto.randomUUID()}`, ...parsed });
    await reports.add(created);
    await appendDemoAudit(db, actor.id, "dailyReports", created.id, "create", `Added report for ${created.date}`);
  });
}

export type DemoEditableKind = "projects" | "warehouses" | "materials" | "equipment" | "employees" | "suppliers" | "dailyReports";

function demoRecordLabel(kind: DemoEditableKind, row: DemoData[DemoEditableKind][number]): string {
  if (kind === "dailyReports") return `Daily report ${(row as DemoData["dailyReports"][number]).date}`;
  if (kind === "projects" || kind === "materials" || kind === "equipment") {
    const coded = row as DemoData["projects" | "materials" | "equipment"][number];
    return `${coded.code} · ${coded.name}`;
  }
  return (row as DemoData["warehouses" | "suppliers" | "employees"][number]).name;
}

export async function updateDemoRecord(db: DemoDatabase, kind: DemoEditableKind, recordId: string, changes: Record<string, unknown>): Promise<void> {
  await initializeDemo(db);
  await db.transaction("rw", db.tables, async () => {
    const actor = await selectedDemoActor(db);
    if (!isDemoManager(actor.role)) throw new Error("This demo role cannot make that change.");
    const table = demoTable(db, kind);
    const current = await table.get(recordId);
    if (!current) throw new Error("Record is unavailable.");
    const next = demoSchemas[kind].parse({ ...current, ...changes, id: recordId });
    if (kind === "projects") {
      const project = next as DemoData["projects"][number];
      if (project.startDate && project.targetCompletionDate && project.targetCompletionDate < project.startDate) throw new Error("Target completion cannot be before the start date.");
      if ((await demoTable(db, "projects").toArray()).some((row) => row.id !== recordId && row.code.toLowerCase() === project.code.toLowerCase())) throw new Error("A project with this code already exists.");
    }
    if (kind === "warehouses") {
      const warehouse = next as DemoData["warehouses"][number];
      const old = current as DemoData["warehouses"][number];
      if ((await demoTable(db, "warehouses").toArray()).some((row) => row.id !== recordId && row.name.toLowerCase() === warehouse.name.toLowerCase())) throw new Error("A warehouse with this name already exists.");
      if (old.name !== warehouse.name) {
        for (const asset of await demoTable(db, "equipment").toArray()) if (asset.location === old.name) await demoTable(db, "equipment").update(asset.id, { location: warehouse.name });
      }
    }
    if (kind === "materials") {
      if (await demoTable(db, "supplierPrices").where("materialId").equals(recordId).first()) throw new Error("This material has supplier price history and cannot be deleted.");
      const material = next as DemoData["materials"][number];
      const old = current as DemoData["materials"][number];
      if ((await demoTable(db, "materials").toArray()).some((row) => row.id !== recordId && row.code.toLowerCase() === material.code.toLowerCase())) throw new Error("A material with this SKU already exists.");
      if ((old.code !== material.code || old.unit !== material.unit) && await demoTable(db, "transactions").where("materialId").equals(recordId).first()) throw new Error("SKU and unit cannot change after stock history exists. The material name can still be edited.");
    }
    if (kind === "equipment") {
      const asset = next as DemoData["equipment"][number];
      if ((current as DemoData["equipment"][number]).status === "assigned" || asset.status === "assigned") throw new Error("Return checked-out equipment before editing its registry record.");
      if ((await demoTable(db, "equipment").toArray()).some((row) => row.id !== recordId && row.code.toLowerCase() === asset.code.toLowerCase())) throw new Error("Equipment with this code already exists.");
      const locations = [...(await demoTable(db, "warehouses").toArray()).map((row) => row.name), ...(await demoTable(db, "sites").toArray()).map((row) => row.name)];
      if (!locations.includes(asset.location)) throw new Error("Choose an existing warehouse or site.");
    }
      if (kind === "suppliers") {
      const supplier = next as DemoData["suppliers"][number];
      if ((await demoTable(db, "suppliers").toArray()).some((row) => row.id !== recordId && row.name.toLowerCase() === supplier.name.toLowerCase())) throw new Error("This supplier already exists.");
      }
    if (kind === "employees") {
        const employee = next as DemoData["employees"][number];
        if ((await demoTable(db, "employees").toArray()).some((row) => row.id !== recordId && row.name.toLowerCase() === employee.name.toLowerCase())) throw new Error("An employee with this name already exists.");
        if (employee.userId) {
          const linked = await demoTable(db, "users").get(employee.userId);
          if (linked?.role !== "worker" || (await demoTable(db, "employees").toArray()).some((row) => row.id !== recordId && row.userId === employee.userId)) throw new Error("Choose an unlinked worker account.");
        }
      }
    if (kind === "dailyReports") {
      const report = next as DemoData["dailyReports"][number];
      if (!(await demoTable(db, "projects").get(report.projectId))) throw new Error("Choose an existing project.");
    }
    await table.put(next);
    await appendDemoAudit(db, actor.id, kind, recordId, "update", `Updated ${demoRecordLabel(kind, next)}`);
  });
}

export async function deleteDemoRecord(db: DemoDatabase, kind: DemoEditableKind, recordId: string): Promise<void> {
  await initializeDemo(db);
  await db.transaction("rw", db.tables, async () => {
    const actor = await selectedDemoActor(db);
    if (!isDemoManager(actor.role)) throw new Error("This demo role cannot make that change.");
    const table = demoTable(db, kind);
    const current = await table.get(recordId);
    if (!current) throw new Error("Record is unavailable.");
    const qrType = kind === "materials" ? "material" : kind === "equipment" ? "equipment" : kind === "warehouses" ? "warehouse" : null;
    if (kind === "projects") {
      const sites = await demoTable(db, "sites").where("projectId").equals(recordId).toArray();
      const siteIds = new Set(sites.map((site) => site.id));
      const hasHistory = Boolean(
        await demoTable(db, "materialRequests").where("projectId").equals(recordId).first()
        || await demoTable(db, "dailyReports").where("projectId").equals(recordId).first()
        || await demoTable(db, "projectAssignments").where("projectId").equals(recordId).first()
        || await demoTable(db, "equipmentRequests").where("projectId").equals(recordId).first()
        || await demoTable(db, "attendance").where("projectId").equals(recordId).first()
        || await demoTable(db, "employeeAssignments").where("projectId").equals(recordId).first()
        || await demoTable(db, "projectExpenses").where("projectId").equals(recordId).first()
        || await demoTable(db, "projectMaterialPlans").where("projectId").equals(recordId).first()
        || (await demoTable(db, "siteBalances").toArray()).some((row) => siteIds.has(row.siteId))
        || (await demoTable(db, "equipment").toArray()).some((row) => sites.some((site) => site.name === row.location))
      );
      if (hasHistory) throw new Error("This project has linked work or history and cannot be deleted.");
      await demoTable(db, "qrCodes").bulkDelete((await demoTable(db, "qrCodes").toArray()).filter((row) => row.entityType === "project_site" && sites.some((site) => site.id === row.entityId)).map((row) => row.id));
      await demoTable(db, "sites").bulkDelete(sites.map((site) => site.id));
    }
    if (kind === "warehouses") {
      const warehouse = current as DemoData["warehouses"][number];
      if ((await demoTable(db, "balances").toArray()).some((row) => row.warehouseId === recordId)
        || await demoTable(db, "transactions").where("warehouseId").equals(recordId).first()
        || (await demoTable(db, "warehouseMemberships").toArray()).some((row) => row.warehouseId === recordId)
        || (await demoTable(db, "materialRequests").toArray()).some((row) => !row.legacy && row.warehouseId === recordId)
        || (await demoTable(db, "requestMovements").toArray()).some((row) => row.warehouseId === recordId)
        || (await demoTable(db, "equipment").toArray()).some((row) => row.location === warehouse.name)) throw new Error("This warehouse has stock, assignments, assets or movement history and cannot be deleted.");
      if (await demoTable(db, "projectMaterialPlans").where("warehouseId").equals(recordId).first()) throw new Error("This warehouse is used by a project material plan and cannot be deleted.");
      if ((await demoTable(db, "equipmentRequests").toArray()).some((row) => row.sourceLocationType === "warehouse" && row.sourceLocationId === recordId)) throw new Error("This warehouse has equipment handover history and cannot be deleted.");
    }
    if (kind === "materials") {
      if (await demoTable(db, "transactions").where("materialId").equals(recordId).first()
        || (await demoTable(db, "materialRequests").toArray()).some((row) => row.materialId === recordId)
        || (await demoTable(db, "requestMovements").toArray()).some((row) => row.materialId === recordId)) throw new Error("This material has stock or request history and cannot be deleted.");
      if (await demoTable(db, "projectMaterialPlans").where("materialId").equals(recordId).first()) throw new Error("This material is used by a project plan and cannot be deleted.");
      const balances = (await demoTable(db, "balances").toArray()).filter((row) => row.materialId === recordId);
      const siteBalances = (await demoTable(db, "siteBalances").toArray()).filter((row) => row.materialId === recordId);
      if ([...balances, ...siteBalances].some((row) => row.quantity !== 0)) throw new Error("This material still has stock and cannot be deleted.");
      await demoTable(db, "balances").bulkDelete(balances.map((row) => row.id));
      await demoTable(db, "siteBalances").bulkDelete(siteBalances.map((row) => row.id));
    }
      if (kind === "suppliers" && (await demoTable(db, "purchaseOrders").where("supplierId").equals(recordId).first() || await demoTable(db, "supplierPrices").where("supplierId").equals(recordId).first())) throw new Error("This supplier has price or purchase history and cannot be deleted.");
      if (kind === "employees" && (await demoTable(db, "attendance").where("employeeId").equals(recordId).first() || await demoTable(db, "employeeAssignments").where("employeeId").equals(recordId).first())) throw new Error("This employee has project assignments or attendance history and cannot be deleted.");
    if (kind === "equipment" && await demoTable(db, "equipmentRequests").where("assetId").equals(recordId).first()) throw new Error("This equipment has request or custody history and cannot be deleted.");
    await table.delete(recordId);
    if (qrType) await demoTable(db, "qrCodes").where("[entityType+entityId]").equals([qrType, recordId]).delete();
    await appendDemoAudit(db, actor.id, kind, recordId, "delete", `Deleted ${demoRecordLabel(kind, current)}`);
  });
}

export async function registerDemoEmployee(db: DemoDatabase, input: DemoEmployeeInput): Promise<void> {
  const parsed = demoEmployeeInputSchema.parse(input);
  await initializeDemo(db);
  const employees = demoTable(db, "employees");
  await db.transaction("rw", employees, demoTable(db, "users"), db.auditLogs, db.meta, async () => {
    const actor = await selectedDemoActor(db);
    if (!isDemoManager(actor.role)) throw new Error("This demo role cannot make that change.");
    if (parsed.userId) {
      const linked = await demoTable(db, "users").get(parsed.userId);
      if (linked?.role !== "worker" || (await employees.toArray()).some((row) => row.userId === parsed.userId)) throw new Error("Choose an unlinked worker account.");
    }
    const created = demoSchemas.employees.parse({ id: `demo-employee-${crypto.randomUUID()}`, ...parsed });
    await employees.add(created);
    await appendDemoAudit(db, actor.id, "employees", created.id, "create", `Added ${created.name}`);
  });
}

export async function assignDemoEmployee(db: DemoDatabase, input: DemoEmployeeAssignmentInput): Promise<void> {
  const parsed = demoEmployeeAssignmentInputSchema.parse(input);
  await initializeDemo(db);
  await db.transaction("rw", db.tables, async () => {
    const actor = await selectedDemoActor(db);
    if (!isDemoManager(actor.role)) throw new Error("Only a manager can assign an employee in the demo.");
    const employee = await demoTable(db, "employees").get(parsed.employeeId);
    const project = await demoTable(db, "projects").get(parsed.projectId);
    const site = await demoTable(db, "sites").get(parsed.siteId);
    if (!employee || !project || project.status !== "active" || site?.projectId !== project.id || project.startDate && parsed.startDate < project.startDate) throw new Error("Choose an active project site and a start date within its schedule.");
    if (parsed.endDate && parsed.endDate < parsed.startDate) throw new Error("Assignment end date must follow its start date.");
    const existing = await demoTable(db, "employeeAssignments").where("[employeeId+projectId]").equals([employee.id, project.id]).toArray();
    if (existing.some((row) => row.siteId === site.id && (row.endDate ?? "9999-12-31") >= parsed.startDate && (parsed.endDate ?? "9999-12-31") >= row.startDate)) throw new Error("This employee already has an assignment at this site for these dates.");
    const assignment = demoSchemas.employeeAssignments.parse({ id: `demo-employee-assignment-${crypto.randomUUID()}`, ...parsed });
    await demoTable(db, "employeeAssignments").add(assignment);
    await appendDemoAudit(db, actor.id, "employee assignments", assignment.id, "assign", `Assigned ${employee.name} to ${site.name}`);
  });
}

export async function endDemoEmployeeAssignment(db: DemoDatabase, assignmentId: string, endDate: string): Promise<void> {
  await initializeDemo(db);
  await db.transaction("rw", db.tables, async () => {
    const actor = await selectedDemoActor(db);
    if (!isDemoManager(actor.role)) throw new Error("Only a manager can end an employee assignment.");
    const assignments = demoTable(db, "employeeAssignments");
    const assignment = await assignments.get(assignmentId);
    if (!assignment || assignment.endDate) throw new Error("This assignment is unavailable or already ended.");
    if (!demoEmployeeAssignmentInputSchema.shape.startDate.safeParse(endDate).success || endDate < assignment.startDate) throw new Error("Choose an end date on or after the assignment start.");
    if ((await demoTable(db, "attendance").where("employeeId").equals(assignment.employeeId).toArray()).some((row) => row.assignmentId === assignment.id && row.date > endDate)) throw new Error("Attendance exists after this date; choose a later end date.");
    await assignments.update(assignment.id, { endDate });
    await appendDemoAudit(db, actor.id, "employee assignments", assignment.id, "update", `Ended assignment on ${endDate}`);
  });
}

export async function postDemoAttendance(db: DemoDatabase, input: DemoAttendanceInput): Promise<void> {
  const parsed = demoAttendanceInputSchema.parse(input);
  await initializeDemo(db);
  await db.transaction("rw", db.tables, async () => {
    const actor = await selectedDemoActor(db);
    if (!isDemoManager(actor.role)) throw new Error("Only a manager can post attendance and labor cost.");
    const assignment = await demoTable(db, "employeeAssignments").get(parsed.assignmentId);
    const employee = assignment && await demoTable(db, "employees").get(assignment.employeeId);
    const project = assignment && await demoTable(db, "projects").get(assignment.projectId);
    if (!assignment || !employee || !project || project.status !== "active" || parsed.date < assignment.startDate || assignment.endDate && parsed.date > assignment.endDate) throw new Error("Choose an employee assigned to an active project on this date.");
    if (parsed.status === "present" ? parsed.hoursWorked <= 0 || parsed.hoursWorked > 24 || parsed.paidDayBasisPoints <= 0 || !employee.dailyWageCentavos : parsed.hoursWorked !== 0 || parsed.paidDayBasisPoints !== 0) throw new Error("Present entries need hours and an approved daily wage; absent entries must have zero hours and cost.");
    if (Math.abs(parsed.hoursWorked * 100 - Math.round(parsed.hoursWorked * 100)) > 0.000001) throw new Error("Use at most two decimal places for hours.");
    const entries = await demoTable(db, "attendance").where("employeeId").equals(employee.id).toArray();
    const reversed = new Set((await demoTable(db, "attendanceReversals").toArray()).map((row) => row.attendanceId));
    if (entries.some((row) => row.projectId === project.id && row.date === parsed.date && !reversed.has(row.id))) throw new Error("This employee already has attendance for the project and date. Reverse that entry before replacing it.");
    const workedCentiHours = entries.filter((row) => row.date === parsed.date && !reversed.has(row.id)).reduce((sum, row) => sum + Math.round((row.hoursWorked ?? 0) * 100), 0);
    if (workedCentiHours + Math.round(parsed.hoursWorked * 100) > 2400) throw new Error("An employee cannot have more than 24 recorded hours across projects on one date.");
    const rateSnapshotCentavos = parsed.status === "present" ? employee.dailyWageCentavos : undefined;
    const costCentavos = rateSnapshotCentavos === undefined ? 0 : Number((BigInt(rateSnapshotCentavos) * BigInt(parsed.paidDayBasisPoints) + BigInt(5000)) / BigInt(10000));
    const entry = demoSchemas.attendance.parse({ id: `demo-attendance-${crypto.randomUUID()}`, employeeId: employee.id, projectId: project.id, siteId: assignment.siteId, assignmentId: assignment.id, date: parsed.date, status: parsed.status, hoursWorked: parsed.hoursWorked, paidDayBasisPoints: parsed.paidDayBasisPoints, rateSnapshotCentavos, costCentavos, note: parsed.note, recordedBy: actor.id, createdAt: new Date().toISOString() });
    await demoTable(db, "attendance").add(entry);
    await appendDemoAudit(db, actor.id, "attendance", entry.id, "create", `Posted ${employee.name} ${entry.status} at ${project.name} on ${entry.date}`);
  });
}

export async function reverseDemoAttendance(db: DemoDatabase, attendanceId: string, reason: string): Promise<void> {
  await initializeDemo(db);
  await db.transaction("rw", db.tables, async () => {
    const actor = await selectedDemoActor(db);
    if (!isDemoManager(actor.role)) throw new Error("Only a manager can reverse attendance.");
    const entry = await demoTable(db, "attendance").get(attendanceId);
    if (!entry) throw new Error("Attendance entry is unavailable.");
    if (await demoTable(db, "attendanceReversals").where("attendanceId").equals(attendanceId).first()) throw new Error("This attendance entry is already reversed.");
    const reversal = demoSchemas.attendanceReversals.parse({ id: `demo-attendance-reversal-${crypto.randomUUID()}`, attendanceId, reason, actorId: actor.id, createdAt: new Date().toISOString() });
    await demoTable(db, "attendanceReversals").add(reversal);
    await appendDemoAudit(db, actor.id, "attendance", entry.id, "reverse", `Reversed attendance on ${entry.date}: ${reversal.reason}`);
  });
}

export async function recordDemoStockIn(db: DemoDatabase, input: DemoStockInInput): Promise<void> {
  const parsed = demoStockInInputSchema.parse(input);
  await initializeDemo(db);
  await db.transaction("rw", db.tables, async () => {
    const actor = await selectedDemoActor(db);
    await requireDemoRole(db, [...demoManagerRoles, "warehouse_staff"]);
    await requireWarehouseAccess(db, actor, parsed.warehouseId);
    const transactions = demoTable(db, "transactions");
    const existing = await transactions.get(parsed.operationId);
    if (existing) {
      if (existing.kind === "stock_in" && existing.materialId === parsed.materialId && existing.warehouseId === parsed.warehouseId && existing.quantity === parsed.quantity) return;
      throw new Error("This stock-in reference is already used for another movement.");
    }
    if (!(await demoTable(db, "materials").get(parsed.materialId))) throw new Error("Choose an existing material.");
    if (!(await demoTable(db, "warehouses").get(parsed.warehouseId))) throw new Error("Choose an existing warehouse.");
    const balances = demoTable(db, "balances");
    const current = await balances.where("[materialId+warehouseId]").equals([parsed.materialId, parsed.warehouseId]).first();
    const next = demoSchemas.balances.parse({ id: current?.id ?? `demo-balance-${crypto.randomUUID()}`, materialId: parsed.materialId, warehouseId: parsed.warehouseId, quantity: milliToQuantity(quantityToMilli(current?.quantity ?? 0) + quantityToMilli(parsed.quantity)) });
    const movement = demoSchemas.transactions.parse({ id: parsed.operationId, materialId: parsed.materialId, warehouseId: parsed.warehouseId, quantity: parsed.quantity, kind: "stock_in", date: new Date().toISOString().slice(0, 10) });
    await balances.put(next);
    await transactions.add(movement);
    await appendDemoAudit(db, actor.id, "transactions", movement.id, "stock_in", `Received ${parsed.quantity} units of material into warehouse`);
  });
}

export async function registerDemoEquipment(db: DemoDatabase, input: DemoEquipmentInput): Promise<void> {
  const parsed = demoEquipmentInputSchema.parse(input);
  if (parsed.status === "assigned") throw new Error("Equipment custody must be assigned through a request.");
  const code = parsed.code.toUpperCase();
  await initializeDemo(db);
  await db.transaction("rw", db.tables, async () => {
    const actor = await selectedDemoActor(db);
    if (!isDemoManager(actor.role)) throw new Error("This demo role cannot make that change.");
    const equipment = demoTable(db, "equipment");
    if ((await equipment.toArray()).some((asset) => asset.code.toLowerCase() === code.toLowerCase())) throw new Error("Equipment with this code already exists.");
    const created = demoSchemas.equipment.parse({ id: `demo-equipment-${crypto.randomUUID()}`, ...parsed, code });
    await equipment.add(created);
    await ensureDemoQr(db, "equipment", created.id, actor.id);
    await appendDemoAudit(db, actor.id, "equipment", created.id, "create", `Added ${code} · ${created.name}`);
  });
}

function demoEquipmentSource(tables: {
  warehouses: DemoData["warehouses"];
  sites: DemoData["sites"];
}, assetLocation: string, projectId: string, siteId: string) {
  const site = tables.sites.find((row) => row.id === siteId && row.projectId === projectId && row.name === assetLocation);
  if (site) return { sourceLocationId: site.id, sourceLocationType: "site" as const };
  const warehouse = tables.warehouses.find((row) => row.name === assetLocation);
  return warehouse ? { sourceLocationId: warehouse.id, sourceLocationType: "warehouse" as const } : null;
}

export async function submitDemoEquipmentRequest(db: DemoDatabase, input: DemoEquipmentRequestInput): Promise<void> {
  const parsed = demoEquipmentRequestInputSchema.parse(input);
  await initializeDemo(db);
  await db.transaction("rw", db.tables, async () => {
    const actor = await selectedDemoActor(db);
    if (isDemoManager(actor.role) || !["project_manager", "engineer", "foreman"].includes(actor.role)) throw new Error("Only assigned project staff can request equipment.");
    await requireProjectAccess(db, actor, parsed.projectId);
    const project = await demoTable(db, "projects").get(parsed.projectId);
    const site = await demoTable(db, "sites").get(parsed.siteId);
    const asset = await demoTable(db, "equipment").get(parsed.assetId);
    const today = new Date().toISOString().slice(0, 10);
    if (!project || project.status !== "active" || !site || site.projectId !== project.id) throw new Error("Choose an active project and its site.");
    if (!asset || asset.status !== "available") throw new Error("Equipment is not available.");
    if (!demoEquipmentSource({ warehouses: await demoTable(db, "warehouses").toArray(), sites: await demoTable(db, "sites").toArray() }, asset.location, project.id, site.id)) throw new Error("Equipment must be at this site or a warehouse.");
    if (parsed.neededOn < today || parsed.neededOn > new Date(Date.now() + 365 * 86400000).toISOString().slice(0, 10)) throw new Error("Choose a current or upcoming need date.");
    const requests = demoTable(db, "equipmentRequests");
    if ((await requests.where("assetId").equals(asset.id).toArray()).some((row) => row.status === "submitted" && row.projectId === project.id && row.siteId === site.id && row.requestedBy === actor.id)) throw new Error("You already have a pending request for this equipment and site.");
    const created = demoSchemas.equipmentRequests.parse({ id: `demo-equipment-request-${crypto.randomUUID()}`, ...parsed, requestedBy: actor.id, status: "submitted", createdAt: new Date().toISOString() });
    await requests.add(created);
    await appendDemoAudit(db, actor.id, "equipmentRequests", created.id, "submit", `Requested ${asset.code} for ${project.code}`);
  });
}

export async function decideDemoEquipmentRequest(db: DemoDatabase, requestId: string, approve: boolean, note: string): Promise<void> {
  await initializeDemo(db);
  await db.transaction("rw", db.tables, async () => {
    const actor = await selectedDemoActor(db);
    if (!isDemoManager(actor.role)) throw new Error("Only an admin can decide equipment requests.");
    const requests = demoTable(db, "equipmentRequests");
    const request = await requests.get(requestId);
    if (!request || !["submitted", "approved"].includes(request.status) || (approve && request.status !== "submitted")) throw new Error("This request is no longer pending or approved for withdrawal.");
    const trimmedNote = note.trim();
    if (trimmedNote.length > 500 || (!approve && trimmedNote.length < 3)) throw new Error("Enter a rejection reason of at least three characters.");
    const asset = await demoTable(db, "equipment").get(request.assetId);
    if (!asset || (approve && asset.status !== "available")) throw new Error("Equipment is no longer available.");
    const source = demoEquipmentSource({ warehouses: await demoTable(db, "warehouses").toArray(), sites: await demoTable(db, "sites").toArray() }, asset.location, request.projectId, request.siteId);
    if (approve && (!source || (await requests.where("assetId").equals(asset.id).toArray()).some((row) => row.id !== request.id && ["approved", "checked_out"].includes(row.status)))) throw new Error("Equipment is already reserved or its location changed.");
    await requests.put(demoSchemas.equipmentRequests.parse({ ...request, status: approve ? "approved" : "rejected", decidedBy: actor.id, decidedAt: new Date().toISOString(), decisionNote: trimmedNote || undefined, ...(approve ? source : { sourceLocationId: undefined, sourceLocationType: undefined }) }));
    await appendDemoAudit(db, actor.id, "equipmentRequests", request.id, approve ? "approve" : "reject", `${approve ? "Approved" : request.status === "approved" ? "Withdrew approval for" : "Rejected"} ${asset.code}`);
  });
}

export async function checkoutDemoEquipmentRequest(db: DemoDatabase, requestId: string): Promise<void> {
  await initializeDemo(db);
  await db.transaction("rw", db.tables, async () => {
    const actor = await selectedDemoActor(db);
    if (!isDemoManager(actor.role)) throw new Error("Only an admin can check out equipment.");
    const requests = demoTable(db, "equipmentRequests");
    const request = await requests.get(requestId);
    if (!request || request.status !== "approved" || !request.sourceLocationId || !request.sourceLocationType) throw new Error("This request is not approved for handover.");
    const site = await demoTable(db, "sites").get(request.siteId);
    const project = await demoTable(db, "projects").get(request.projectId);
    const asset = await demoTable(db, "equipment").get(request.assetId);
    const source = request.sourceLocationType === "warehouse" ? await demoTable(db, "warehouses").get(request.sourceLocationId) : await demoTable(db, "sites").get(request.sourceLocationId);
    if (!site || site.projectId !== request.projectId || !project || project.status !== "active" || !source || !asset || asset.status !== "available" || asset.location !== source.name) throw new Error("Equipment custody changed; review the request.");
    await demoTable(db, "equipment").update(asset.id, { status: "assigned", location: site.name });
    await requests.put(demoSchemas.equipmentRequests.parse({ ...request, status: "checked_out", checkedOutBy: actor.id, checkedOutAt: new Date().toISOString() }));
    await appendDemoAudit(db, actor.id, "equipmentRequests", request.id, "dispatch", `Checked out ${asset.code} to ${site.name}`);
  });
}

export async function returnDemoEquipmentRequest(db: DemoDatabase, requestId: string, needsMaintenance: boolean, note: string): Promise<void> {
  await initializeDemo(db);
  await db.transaction("rw", db.tables, async () => {
    const actor = await selectedDemoActor(db);
    if (!isDemoManager(actor.role)) throw new Error("Only an admin can record equipment returns.");
    const requests = demoTable(db, "equipmentRequests");
    const request = await requests.get(requestId);
    if (!request || request.status !== "checked_out" || !request.sourceLocationId || !request.sourceLocationType) throw new Error("This equipment is not checked out.");
    const trimmedNote = note.trim();
    if (trimmedNote.length < 3 || trimmedNote.length > 500) throw new Error("Record the return condition in 3–500 characters.");
    const site = await demoTable(db, "sites").get(request.siteId);
    const asset = await demoTable(db, "equipment").get(request.assetId);
    const source = request.sourceLocationType === "warehouse" ? await demoTable(db, "warehouses").get(request.sourceLocationId) : await demoTable(db, "sites").get(request.sourceLocationId);
    if (!asset || asset.status !== "assigned" || !site || asset.location !== site.name || !source) throw new Error("Equipment custody does not match this request.");
    await demoTable(db, "equipment").update(asset.id, { status: needsMaintenance ? "under_maintenance" : "available", location: source.name });
    await requests.put(demoSchemas.equipmentRequests.parse({ ...request, status: "returned", returnedBy: actor.id, returnedAt: new Date().toISOString(), returnNote: trimmedNote, needsMaintenance }));
    await appendDemoAudit(db, actor.id, "equipmentRequests", request.id, "receipt", `Returned ${asset.code}${needsMaintenance ? " for maintenance" : ""}`);
  });
}

export async function updateDemoEmployeePhoto(db: DemoDatabase, employeeId: string, photo: string | null): Promise<void> {
  const parsedPhoto = photo === null ? null : demoEmployeePhotoSchema.parse(photo);
  await initializeDemo(db);
  const employees = demoTable(db, "employees");
  await db.transaction("rw", employees, demoTable(db, "users"), db.auditLogs, db.meta, async () => {
    const actor = await selectedDemoActor(db);
    if (!isDemoManager(actor.role)) throw new Error("This demo role cannot make that change.");
    const employee = await employees.get(employeeId);
    if (!employee) throw new Error("Employee is unavailable.");
    await employees.update(employeeId, { photo: parsedPhoto ?? undefined });
    await appendDemoAudit(db, actor.id, "employees", employeeId, "update", `${photo ? "Updated" : "Removed"} photo for ${employee.name}`);
  });
}

export async function submitDemoMaterialRequest(db: DemoDatabase, input: DemoRequestInput): Promise<void> {
  const parsed = demoRequestInputSchema.parse(input);
  await initializeDemo(db);
  await db.transaction("rw", db.tables, async () => {
    const actor = await selectedDemoActor(db);
    if (isDemoManager(actor.role) || !["project_manager", "engineer", "foreman"].includes(actor.role)) throw new Error("Only assigned project staff can submit material requests.");
    await requireProjectAccess(db, actor, parsed.projectId);
    const site = await demoTable(db, "sites").get(parsed.siteId);
    if (!site || site.projectId !== parsed.projectId) throw new Error("Choose a site belonging to this project.");
    if (!(await demoTable(db, "warehouses").get(parsed.warehouseId))) throw new Error("Choose an existing warehouse.");
    if (!(await demoTable(db, "materials").get(parsed.materialId))) throw new Error("Choose an existing material.");
    const created = demoSchemas.materialRequests.parse({ id: `demo-request-${crypto.randomUUID()}`, ...parsed, status: "submitted", approvedQuantity: 0, unitCostCentavos: 0, requestedBy: actor.id, requestedAt: new Date().toISOString(), legacy: false });
    await demoTable(db, "materialRequests").add(created);
    await appendDemoAudit(db, actor.id, "materialRequests", created.id, "submit", `Submitted material request for ${parsed.quantity} units`);
  });
}

export async function assignDemoProject(db: DemoDatabase, input: DemoProjectAssignmentInput): Promise<void> {
  const parsed = demoProjectAssignmentInputSchema.parse(input);
  await initializeDemo(db);
  await db.transaction("rw", db.tables, async () => {
    await requireDemoRole(db, [...demoManagerRoles]);
    const user = await demoTable(db, "users").get(parsed.userId);
    if (!user || user.isActive === false || !["project_manager", "engineer", "foreman"].includes(user.role)) throw new Error("Choose an active project role.");
    if (!(await demoTable(db, "projects").get(parsed.projectId))) throw new Error("Choose an existing project.");
    const assignments = demoTable(db, "projectAssignments");
    if (await assignments.where("[userId+projectId]").equals([parsed.userId, parsed.projectId]).first()) return;
    await assignments.add(demoSchemas.projectAssignments.parse({ id: `demo-assignment-${crypto.randomUUID()}`, ...parsed }));
    await appendDemoAudit(db, (await selectedDemoActor(db)).id, "projectAssignments", parsed.projectId, "assign", `Assigned user to project`);
  });
}

export async function assignDemoWarehouse(db: DemoDatabase, input: DemoWarehouseMembershipInput): Promise<void> {
  const parsed = demoWarehouseMembershipInputSchema.parse(input);
  await initializeDemo(db);
  await db.transaction("rw", db.tables, async () => {
    await requireDemoRole(db, [...demoManagerRoles]);
    const user = await demoTable(db, "users").get(parsed.userId);
    if (!user || user.isActive === false || user.role !== "warehouse_staff") throw new Error("Choose an active warehouse staff user.");
    if (!(await demoTable(db, "warehouses").get(parsed.warehouseId))) throw new Error("Choose an existing warehouse.");
    const memberships = demoTable(db, "warehouseMemberships");
    if (await memberships.where("[userId+warehouseId]").equals([parsed.userId, parsed.warehouseId]).first()) return;
    await memberships.add(demoSchemas.warehouseMemberships.parse({ id: `demo-membership-${crypto.randomUUID()}`, ...parsed }));
    await appendDemoAudit(db, (await selectedDemoActor(db)).id, "warehouseMemberships", parsed.warehouseId, "assign", `Assigned user to warehouse`);
  });
}

export async function decideDemoMaterialRequest(db: DemoDatabase, input: DemoRequestDecision): Promise<void> {
  const parsed = demoRequestDecisionSchema.parse(input);
  await initializeDemo(db);
  await db.transaction("rw", db.tables, async () => {
    const actor = await selectedDemoActor(db);
    if (!isDemoManager(actor.role)) throw new Error("This demo role cannot approve requests.");
    const requests = demoTable(db, "materialRequests");
    const request = await requests.get(parsed.requestId);
    if (!request || request.legacy || request.status !== "submitted") throw new Error("Only a submitted demo request can be decided.");
    if (parsed.approvedQuantity > request.quantity) throw new Error("Approved quantity cannot exceed requested quantity.");
    if (parsed.approvedQuantity === 0 && !parsed.rejectionReason) throw new Error("A rejection reason is required.");
    if (parsed.approvedQuantity > 0 && parsed.unitCostCentavos <= 0) throw new Error("Enter a positive illustrative unit cost.");
    await requests.put(demoSchemas.materialRequests.parse({ ...request, status: parsed.approvedQuantity > 0 ? "approved" : "rejected", approvedQuantity: parsed.approvedQuantity, unitCostCentavos: parsed.approvedQuantity > 0 ? parsed.unitCostCentavos : 0, decidedBy: actor.id, decidedAt: new Date().toISOString(), rejectionReason: parsed.approvedQuantity === 0 ? parsed.rejectionReason : undefined }));
    await appendDemoAudit(db, actor.id, "materialRequests", request.id, parsed.approvedQuantity > 0 ? "approve" : "reject", parsed.approvedQuantity > 0 ? `Approved ${parsed.approvedQuantity} units` : "Rejected request");
  });
}

async function requestForMovement(db: DemoDatabase, requestId: string): Promise<ActiveDemoRequest> {
  const request = await demoTable(db, "materialRequests").get(requestId);
  if (!request || request.legacy || request.status !== "approved") throw new Error("This demo request is not approved for movement.");
  return request;
}

async function checkMovementRetry(db: DemoDatabase, input: DemoRequestMovementInput, kind: DemoData["requestMovements"][number]["kind"]): Promise<boolean> {
  const existing = await demoTable(db, "requestMovements").get(input.operationId);
  if (!existing) return false;
  if (existing.requestId === input.requestId && existing.kind === kind && quantityToMilli(existing.quantity) === quantityToMilli(input.quantity)) return true;
  throw new Error("This movement reference is already used for a different operation.");
}

export async function dispatchDemoMaterialRequest(db: DemoDatabase, input: DemoRequestMovementInput): Promise<void> {
  const parsed = demoRequestMovementInputSchema.parse(input);
  await initializeDemo(db);
  await db.transaction("rw", db.tables, async () => {
    const actor = await selectedDemoActor(db);
    const request = await requestForMovement(db, parsed.requestId);
    await requireWarehouseAccess(db, actor, request.warehouseId);
    if (await checkMovementRetry(db, parsed, "dispatch")) return;
    const movements = await demoTable(db, "requestMovements").where("requestId").equals(request.id).toArray();
    const progress = summarizeDemoMovements(request, movements);
    const quantityMilli = quantityToMilli(parsed.quantity);
    if (quantityMilli > quantityToMilli(progress.toDispatch)) throw new Error("Dispatch exceeds the approved remaining quantity.");
    const balances = demoTable(db, "balances");
    const balance = await balances.where("[materialId+warehouseId]").equals([request.materialId, request.warehouseId]).first();
    if (!balance || quantityMilli > quantityToMilli(balance.quantity)) throw new Error("Not enough stock in the source warehouse.");
    await balances.update(balance.id, { quantity: milliToQuantity(quantityToMilli(balance.quantity) - quantityMilli) });
    await demoTable(db, "requestMovements").add(demoSchemas.requestMovements.parse({ id: parsed.operationId, requestId: request.id, materialId: request.materialId, warehouseId: request.warehouseId, siteId: request.siteId, actorId: actor.id, kind: "dispatch", quantity: parsed.quantity, occurredAt: new Date().toISOString() }));
    await appendDemoAudit(db, actor.id, "materialRequests", request.id, "dispatch", `Dispatched ${parsed.quantity} units`);
  });
}

export async function receiveDemoMaterialRequest(db: DemoDatabase, input: DemoRequestMovementInput): Promise<void> {
  const parsed = demoRequestMovementInputSchema.parse(input);
  await initializeDemo(db);
  await db.transaction("rw", db.tables, async () => {
    const actor = await selectedDemoActor(db);
    const request = await requestForMovement(db, parsed.requestId);
    await requireProjectAccess(db, actor, request.projectId);
    if (await checkMovementRetry(db, parsed, "receipt")) return;
    const progress = summarizeDemoMovements(request, await demoTable(db, "requestMovements").where("requestId").equals(request.id).toArray());
    if (quantityToMilli(parsed.quantity) > quantityToMilli(progress.inTransit)) throw new Error("Receipt exceeds the in-transit quantity.");
    const balances = demoTable(db, "siteBalances");
    const current = await balances.where("[materialId+siteId]").equals([request.materialId, request.siteId]).first();
    await balances.put(demoSchemas.siteBalances.parse({ id: current?.id ?? `demo-site-balance-${crypto.randomUUID()}`, materialId: request.materialId, siteId: request.siteId, quantity: milliToQuantity(quantityToMilli(current?.quantity ?? 0) + quantityToMilli(parsed.quantity)) }));
    await demoTable(db, "requestMovements").add(demoSchemas.requestMovements.parse({ id: parsed.operationId, requestId: request.id, materialId: request.materialId, warehouseId: request.warehouseId, siteId: request.siteId, actorId: actor.id, kind: "receipt", quantity: parsed.quantity, occurredAt: new Date().toISOString() }));
    await appendDemoAudit(db, actor.id, "materialRequests", request.id, "receipt", `Received ${parsed.quantity} units at site`);
  });
}

export async function consumeDemoMaterialRequest(db: DemoDatabase, input: DemoRequestMovementInput): Promise<void> {
  const parsed = demoRequestMovementInputSchema.parse(input);
  await initializeDemo(db);
  await db.transaction("rw", db.tables, async () => {
    const actor = await selectedDemoActor(db);
    const request = await requestForMovement(db, parsed.requestId);
    await requireProjectAccess(db, actor, request.projectId);
    if (await checkMovementRetry(db, parsed, "consumption")) return;
    const quantityMilli = quantityToMilli(parsed.quantity);
    const progress = summarizeDemoMovements(request, await demoTable(db, "requestMovements").where("requestId").equals(request.id).toArray());
    if (quantityMilli > quantityToMilli(progress.atSite)) throw new Error("Consumption exceeds received stock for this request.");
    const balances = demoTable(db, "siteBalances");
    const current = await balances.where("[materialId+siteId]").equals([request.materialId, request.siteId]).first();
    if (!current || quantityMilli > quantityToMilli(current.quantity)) throw new Error("Not enough stock at the site.");
    const amount = (BigInt(quantityMilli) * BigInt(request.unitCostCentavos) + BigInt(500)) / BigInt(1000);
    if (amount > BigInt(Number.MAX_SAFE_INTEGER)) throw new Error("Demo cost exceeds supported precision.");
    await balances.update(current.id, { quantity: milliToQuantity(quantityToMilli(current.quantity) - quantityMilli) });
    await demoTable(db, "requestMovements").add(demoSchemas.requestMovements.parse({ id: parsed.operationId, requestId: request.id, materialId: request.materialId, warehouseId: request.warehouseId, siteId: request.siteId, actorId: actor.id, kind: "consumption", quantity: parsed.quantity, occurredAt: new Date().toISOString(), unitCostCentavos: request.unitCostCentavos, amountCentavos: Number(amount) }));
    await appendDemoAudit(db, actor.id, "materialRequests", request.id, "consume", `Used ${parsed.quantity} units at site`);
  });
}

export async function resetDemo(db: DemoDatabase): Promise<void> {
  const seed = validateDemoSnapshot(createDemoSeed());
  await replaceData(db, seed, seed.tables.users[0].id);
}

export async function importDemo(db: DemoDatabase, json: string): Promise<void> {
  if (json.length > 2_000_000) throw new Error("Demo import exceeds the 2 MB limit.");
  let parsed: unknown;
  try { parsed = JSON.parse(json); }
  catch { throw new Error("Demo import is not valid JSON."); }
  const snapshot = validateDemoSnapshot(parsed);
  if (snapshot.tables.users.length === 0) throw new Error("Demo import must include at least one user.");
  const current = await db.meta.get("selectedUserId");
  const selectedUserId = snapshot.tables.users.some((user) => user.id === current?.value)
    ? String(current?.value) : snapshot.tables.users[0].id;
  await replaceData(db, snapshot, selectedUserId);
}

export async function exportDemo(db: DemoDatabase): Promise<string> {
  const { snapshot } = await readDemo(db);
  return JSON.stringify(snapshot, null, 2);
}

export async function getSavedSnapshotInfo(db: DemoDatabase): Promise<{ savedAt: string } | null> {
  const saved = await db.snapshots.get("primary");
  return saved ? { savedAt: saved.savedAt } : null;
}

export async function saveDemoSnapshot(db: DemoDatabase): Promise<{ savedAt: string }> {
  const { snapshot, selectedUserId } = await readDemo(db);
  const savedAt = new Date().toISOString();
  await db.snapshots.put({ key: "primary", savedAt, selectedUserId, snapshot });
  return { savedAt };
}

export async function restoreDemoSnapshot(db: DemoDatabase): Promise<void> {
  const saved = await db.snapshots.get("primary");
  if (!saved) throw new Error("No saved demo snapshot is available.");
  const snapshot = validateDemoSnapshot(saved.snapshot);
  if (!snapshot.tables.users.some((user) => user.id === saved.selectedUserId)) {
    throw new Error("Saved demo snapshot has an invalid account.");
  }
  await replaceData(db, snapshot, saved.selectedUserId);
}
