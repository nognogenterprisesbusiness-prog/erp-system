import Dexie, { type Table } from "dexie";
import { canAssignInitialRole, canManageAccount } from "@/lib/users/access";

import { createDemoSeed } from "./seed";
import {
  DEMO_SCHEMA_VERSION,
  demoEquipmentInputSchema,
  demoEmployeePhotoSchema,
  demoMaterialInputSchema,
  demoSchemas,
  demoStockInInputSchema,
  demoUserInputSchema,
  demoProfileInputSchema,
  demoWarehouseInputSchema,
  demoProjectInputSchema,
  demoSupplierInputSchema,
  demoDailyReportInputSchema,
  demoEmployeeInputSchema,
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
  type DemoMaterialInput,
  type DemoSnapshot,
  type DemoStockInInput,
  type DemoUserInput,
  type DemoWarehouseInput,
  type DemoProjectInput,
  type DemoSupplierInput,
  type DemoDailyReportInput,
  type DemoEmployeeInput,
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
const projectPhotoSeedKey = "demoProjectPhotosV1";
const warehousePhotoSeedKey = "demoWarehousePhotosV1";
const reportPhotoSeedKey = "demoDailyReportPhotosV1";
const materialPhotoSeedKey = "demoMaterialPhotosV1";
const automaticQrSeedKey = "demoAutomaticQrV1";
const equipmentSkuSeedKey = "demoEquipmentSkuV1";
const userContactSeedKey = "demoUserContactV2";

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
      if (!(await db.meta.get(projectPhotoSeedKey))) {
        const projects = demoTable(db, "projects");
        for (const sample of createDemoSeed().tables.projects) {
          const current = await projects.get(sample.id);
          if (current && !current.photo) await projects.update(sample.id, { photo: sample.photo });
        }
        await db.meta.put({ key: projectPhotoSeedKey, value: 1 });
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
    await db.meta.put({ key: warehousePhotoSeedKey, value: 1 });
    await db.meta.put({ key: reportPhotoSeedKey, value: 1 });
    await db.meta.put({ key: materialPhotoSeedKey, value: 1 });
    await db.meta.put({ key: automaticQrSeedKey, value: 1 });
    await db.meta.put({ key: equipmentSkuSeedKey, value: 1 });
    await db.meta.put({ key: userContactSeedKey, value: 1 });
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
  const code = parsed.code.toUpperCase();
  await initializeDemo(db);
  const projects = demoTable(db, "projects");
  const sites = demoTable(db, "sites");
  await db.transaction("rw", [projects, sites, demoTable(db, "users"), demoTable(db, "qrCodes"), db.auditLogs, db.meta], async () => {
    const actor = await selectedDemoActor(db);
    if (!isDemoManager(actor.role)) throw new Error("This demo role cannot make that change.");
    if ((await projects.toArray()).some((project) => project.code.toLowerCase() === code.toLowerCase())) throw new Error("A project with this code already exists.");
    const projectId = `demo-project-${crypto.randomUUID()}`;
    await projects.add(demoSchemas.projects.parse({ id: projectId, code, name: parsed.name, status: parsed.status, location: parsed.location, municipalityCode: parsed.municipalityCode, address: parsed.address, photo: parsed.photo }));
    const site = demoSchemas.sites.parse({ id: `demo-site-${crypto.randomUUID()}`, projectId, name: parsed.siteName });
    await sites.add(site);
    await ensureDemoQr(db, "project_site", site.id, actor.id);
    await appendDemoAudit(db, actor.id, "projects", projectId, "create", `Added ${code} · ${parsed.name}`);
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
      const material = next as DemoData["materials"][number];
      const old = current as DemoData["materials"][number];
      if ((await demoTable(db, "materials").toArray()).some((row) => row.id !== recordId && row.code.toLowerCase() === material.code.toLowerCase())) throw new Error("A material with this SKU already exists.");
      if ((old.code !== material.code || old.unit !== material.unit) && await demoTable(db, "transactions").where("materialId").equals(recordId).first()) throw new Error("SKU and unit cannot change after stock history exists. The material name can still be edited.");
    }
    if (kind === "equipment") {
      const asset = next as DemoData["equipment"][number];
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
        || await demoTable(db, "attendance").where("projectId").equals(recordId).first()
        || await demoTable(db, "projectExpenses").where("projectId").equals(recordId).first()
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
    }
    if (kind === "materials") {
      if (await demoTable(db, "transactions").where("materialId").equals(recordId).first()
        || (await demoTable(db, "materialRequests").toArray()).some((row) => row.materialId === recordId)
        || (await demoTable(db, "requestMovements").toArray()).some((row) => row.materialId === recordId)) throw new Error("This material has stock or request history and cannot be deleted.");
      const balances = (await demoTable(db, "balances").toArray()).filter((row) => row.materialId === recordId);
      const siteBalances = (await demoTable(db, "siteBalances").toArray()).filter((row) => row.materialId === recordId);
      if ([...balances, ...siteBalances].some((row) => row.quantity !== 0)) throw new Error("This material still has stock and cannot be deleted.");
      await demoTable(db, "balances").bulkDelete(balances.map((row) => row.id));
      await demoTable(db, "siteBalances").bulkDelete(siteBalances.map((row) => row.id));
    }
      if (kind === "suppliers" && await demoTable(db, "purchaseOrders").where("supplierId").equals(recordId).first()) throw new Error("This supplier has purchase history and cannot be deleted.");
      if (kind === "employees" && await demoTable(db, "attendance").where("employeeId").equals(recordId).first()) throw new Error("This employee has attendance history and cannot be deleted.");
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
    const created = demoSchemas.employees.parse({ id: `demo-employee-${crypto.randomUUID()}`, ...parsed });
    await employees.add(created);
    await appendDemoAudit(db, actor.id, "employees", created.id, "create", `Added ${created.name}`);
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
