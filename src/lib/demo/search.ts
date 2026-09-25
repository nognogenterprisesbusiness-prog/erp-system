import { demoHref, demoPages, demoRoleViews, type DemoView } from "./navigation";
import { isDemoManager, type DemoData, type DemoRole } from "./schema";
import { visibleDemoEquipmentLocations, visibleDemoProjectIds, visibleDemoWarehouseIds } from "./visibility";

export type DemoSearchItem = { id: string; type: "Page" | "Action" | "Guide" | "Record"; title: string; detail: string; href: string };

const actionCatalog = [
  { id: "add-material", title: "Add material", detail: "Create an inventory item with an opening balance", href: "/demo?view=inventory&action=material", view: "inventory", roles: "manager" },
  { id: "stock-in", title: "Record stock in", detail: "Receive a material into a selected warehouse", href: "/demo?view=inventory&action=stock", view: "inventory", roles: "warehouse" },
  { id: "add-equipment", title: "Add equipment", detail: "Add an asset to the equipment registry", href: "/demo?view=equipment&action=equipment", view: "equipment", roles: "manager" },
  { id: "request-equipment", title: "Request equipment", detail: "Request an asset for an assigned project site", href: "/demo?view=equipment-requests", view: "equipment-requests", roles: "project" },
  { id: "add-warehouse", title: "Add warehouse", detail: "Create another stock location", href: "/demo?view=warehouses&action=add", view: "warehouses", roles: "manager" },
  { id: "add-user", title: "Add user", detail: "Create a user in this demo workspace", href: "/demo?view=users&action=add", view: "users", roles: "manager" },
  { id: "assign-access", title: "Assign project or warehouse access", detail: "Grant a user access to a project or warehouse", href: "/demo?view=users&action=access", view: "users", roles: "manager" },
  { id: "add-project", title: "Add project", detail: "Create a project and its first site", href: "/demo?view=projects&action=add", view: "projects", roles: "manager" },
  { id: "add-supplier", title: "Add supplier", detail: "Register a vendor for the demo", href: "/demo?view=suppliers&action=add", view: "suppliers", roles: "manager" },
  { id: "add-report", title: "Add daily report", detail: "Record a site update for an assigned project", href: "/demo?view=reports&action=add", view: "reports", roles: "project" },
  { id: "add-employee", title: "Add employee", detail: "Register a worker and optionally add a profile photo", href: "/demo?view=workforce&action=add", view: "workforce", roles: "manager" },
  { id: "mark-attendance", title: "Mark attendance", detail: "Record a worker's project hours and daily labor cost", href: "/demo?view=attendance&action=mark", view: "attendance", roles: "manager" },
  { id: "new-request", title: "New material request", detail: "Request stock for an assigned project site", href: "/demo?view=requests&action=new", view: "requests", roles: "requester" },
] as const;

function allowedAction(action: (typeof actionCatalog)[number], role: DemoRole, tables: DemoData | undefined, userId: string | undefined): boolean {
  if (!demoRoleViews[role].includes(action.view)) return false;
  if (action.roles === "manager") return isDemoManager(role);
  if (action.roles === "warehouse") return isDemoManager(role) || role === "warehouse_staff";
  if (action.roles === "requester") return !isDemoManager(role) && ["project_manager", "engineer", "foreman"].includes(role) && Boolean(tables?.projectAssignments.some((row) => row.userId === userId));
  return isDemoManager(role) || ["project_manager", "engineer", "foreman"].includes(role) && Boolean(tables?.projectAssignments.some((row) => row.userId === userId));
}

export function demoQuickShortcuts(role: DemoRole, tables?: DemoData, userId?: string): DemoSearchItem[] {
  const allowed = new Set(demoRoleViews[role]);
  const actions = actionCatalog.filter((action) => allowedAction(action, role, tables, userId))
    .slice(0, 2).map((action): DemoSearchItem => ({ id: action.id, type: "Action", title: action.title, detail: action.detail, href: action.href }));
  const pages = demoPages.filter((page) => allowed.has(page.id) && page.id !== "overview").slice(0, 3)
    .map((page): DemoSearchItem => ({ id: `page-${page.id}`, type: "Page", title: page.label, detail: page.keywords, href: demoHref(page.id) }));
  return [...actions, ...pages];
}

export const demoGuides = [
  { id: "start", title: "Find your way around", detail: "Use the sidebar, quick search, and account menu", keywords: "navigation account search shortcut", requires: "help", href: "/demo", steps: ["Choose a section from the sidebar. The top search opens a matching page, record, or action directly.", "Use the account menu for settings and logout. The account selector in the DEMO strip lets you inspect another role's view.", "Only the actions allowed for the selected account appear in each section."] },
  { id: "projects", title: "Projects and sites", detail: "Find, create, edit and review project records", keywords: "project code status site photo", requires: "projects", href: "/demo?view=projects", steps: ["Search by code, name, or location; use the status pills and column headings to filter and sort.", "Managers can add a project with its first site and an optional photo, then edit the record from its row.", "Open a row to see sites and linked report/request counts. Projects with linked work or history cannot be deleted."] },
  { id: "warehouse", title: "Warehouses and stock locations", detail: "Switch warehouses and manage their details", keywords: "branches stock locations photo", requires: "warehouses", href: "/demo?view=warehouses", steps: ["Choose a warehouse in the top-bar location picker. Its table shows that location only.", "Managers can add or edit a warehouse and attach a photo. Renaming a warehouse updates equipment located there.", "A warehouse with stock, assignments, assets, or movements cannot be deleted."] },
  { id: "inventory", title: "Materials and inventory", detail: "Read location balances, add a SKU and record stock in", keywords: "stock receiving material SKU", requires: "inventory", href: "/demo?view=inventory", steps: ["Select a warehouse or site location in the top bar, then search the balance table by material or SKU.", "Managers can add a material with an opening quantity; authorized warehouse staff can record stock in.", "Stock movements remain in history. A material with posted movements or requests cannot be deleted; SKU and unit are locked after stock history exists."] },
  { id: "requests", title: "Material requests", detail: "Follow a request from site to warehouse and back", keywords: "approval dispatch receipt consumption cost", requires: "requests", href: "/demo?view=requests", steps: ["A project team member selects the project, site, source warehouse, material SKU, quantity, and purpose.", "An authorized manager approves or rejects the request. Approval does not reduce on-hand stock.", "Warehouse dispatch reduces source stock; site receipt adds site stock; recording actual use reduces site stock and applies the demo cost. These approval and costing defaults are illustrative only."] },
  { id: "equipment", title: "Equipment registry", detail: "Find assets by code, SKU, status or location", keywords: "asset machine status code", requires: "equipment", href: "/demo?view=equipment", steps: ["Search equipment by name, asset code, SKU, or location.", "Managers can register and edit equipment; choose its current warehouse or site and operational status.", "The asset code identifies the individual equipment record; the optional SKU identifies its catalog or model."] },
  { id: "equipment-requests", title: "Equipment handovers", detail: "Request, approve, check out and return equipment", keywords: "equipment request handover custody", requires: "equipment-requests", href: "/demo?view=equipment-requests", steps: ["Assigned project staff submit a dated equipment request for a site.", "A manager reviews the request, approves it, then records checkout and return in the separate handover queue.", "Availability and current location update as the asset moves; the registry remains a separate asset list."] },
  { id: "workforce", title: "Employees", detail: "Find contact details and maintain employee portraits", keywords: "worker phone email picture", requires: "workforce", href: "/demo?view=workforce", steps: ["Search the employee table by name, trade, phone, or email.", "Managers can register employees and add or replace a portrait. Photos are converted to WebP and kept on this device."] },
  { id: "attendance", title: "Attendance and labor cost", detail: "Assign workers, mark dated attendance and review hours", keywords: "present absent worker wage site cost", requires: "attendance", href: "/demo?view=attendance", steps: ["A manager assigns a worker to a project site before marking attendance.", "Select a date to see present, absent and unmarked workers; search or filter the worker list.", "A manager records present hours and an explicit paid-day fraction, or marks absent. Posted labor cost stores the wage snapshot and can only be corrected by a reasoned reversal."] },
  { id: "suppliers", title: "Suppliers", detail: "Search vendors and maintain their category", keywords: "vendor supplier purchase photo", requires: "suppliers", href: "/demo?view=suppliers", steps: ["Search or sort the supplier table by name and category, then open a supplier for details.", "Managers can add or edit a supplier with an optional photo; a supplier with linked purchase orders cannot be deleted."] },
  { id: "reports", title: "Daily reports", detail: "Review dated project updates", keywords: "daily site report summary date", requires: "reports", href: "/demo?view=reports", steps: ["Search by project, date, or summary, and sort the table by date or project.", "Assigned project staff can add a site update. Managers can edit or delete an unlinked demo report."] },
  { id: "users", title: "Users and access", detail: "Manage users and project or warehouse assignments", keywords: "role permissions account", requires: "users", href: "/demo?view=users", steps: ["Managers can add a local demo user with a role and email. No invitation email is sent from the demo.", "Assign project staff to a project or warehouse staff to a location. Disabled accounts cannot be selected in the top bar."] },
  { id: "audit", title: "Audit logs", detail: "Review who changed a record and when", keywords: "audit activity history actor", requires: "audit", href: "/demo?view=audit", steps: ["Open Audit logs from the sidebar and search by account, record or change detail.", "Filter by action to review creates, edits, deletions, stock receipts and request transitions.", "The local audit trail is included in demo snapshots and JSON exports. It resets with the rest of the local demo database."] },
  { id: "data", title: "Save and restore local data", detail: "Snapshots, JSON export, import and reset", keywords: "backup import export settings", requires: "settings", href: "/demo?view=settings", steps: ["Save a snapshot before trying a workflow you may want to undo.", "Export JSON for a portable copy. Import replaces local records after validation; reset restores the original sample data.", "These actions affect only the browser's demo database, not connected company data."] },
] as const;

export function searchDemo(tables: DemoData, role: DemoRole, query: string, userId?: string): DemoSearchItem[] {
  const needle = query.trim().slice(0, 80).toLocaleLowerCase();
  if (!needle) return [];
  const allowed = new Set(demoRoleViews[role]);
  const visible = (view: DemoView) => allowed.has(view);
  const matches = (value: string) => value.toLocaleLowerCase().includes(needle);
  const pages: DemoSearchItem[] = demoPages.filter((page) => visible(page.id) && matches(`${page.label} ${page.keywords}`)).map((page) => ({ id: `page-${page.id}`, type: "Page", title: page.label, detail: page.keywords, href: demoHref(page.id) }));
  const actions: DemoSearchItem[] = actionCatalog.filter((action) => allowedAction(action, role, tables, userId) && matches(`${action.title} ${action.detail}`)).map((action) => ({ id: action.id, type: "Action", title: action.title, detail: action.detail, href: action.href }));
  const guides: DemoSearchItem[] = demoGuides.filter((guide) => (!("requires" in guide) || visible(guide.requires)) && matches(`${guide.title} ${guide.detail} ${guide.keywords}`)).map((guide) => ({ id: `guide-${guide.id}`, type: "Guide", title: guide.title, detail: guide.detail, href: `/demo?view=help&topic=${guide.id}` }));
  const records: DemoSearchItem[] = [];
  const projectIds = visibleDemoProjectIds(tables, role, userId ?? "");
  const warehouseIds = visibleDemoWarehouseIds(tables, role, userId ?? "");
  const equipmentLocations = visibleDemoEquipmentLocations(tables, role, userId ?? "");
  const siteIds = new Set(tables.sites.filter((site) => projectIds.has(site.projectId)).map((site) => site.id));
  const stockMaterialIds = new Set([
    ...tables.balances.filter((balance) => warehouseIds.has(balance.warehouseId)).map((balance) => balance.materialId),
    ...tables.siteBalances.filter((balance) => siteIds.has(balance.siteId)).map((balance) => balance.materialId),
  ]);
  const add = (view: DemoView, type: string, rows: { id: string; title: string; detail: string }[]) => {
    if (!visible(view)) return;
    for (const row of rows) if (matches(`${type} ${row.title} ${row.detail}`)) records.push({ id: `${view}-${row.id}`, type: "Record", title: row.title, detail: `${type} · ${row.detail}`, href: demoHref(view) });
  };
  add("projects", "Project", tables.projects.filter((row) => projectIds.has(row.id)).map((row) => ({ id: row.id, title: row.name, detail: `${row.code} · ${row.location}` })));
  add("projects", "Project site", tables.sites.filter((row) => projectIds.has(row.projectId)).map((row) => ({ id: row.id, title: row.name, detail: tables.projects.find((project) => project.id === row.projectId)?.name ?? "Project" })));
  add("warehouses", "Warehouse", tables.warehouses.filter((row) => warehouseIds.has(row.id)).map((row) => ({ id: row.id, title: row.name, detail: row.location })));
  add("inventory", "Material", tables.materials.filter((row) => isDemoManager(role) || stockMaterialIds.has(row.id)).map((row) => ({ id: row.id, title: row.name, detail: `${row.code} · ${row.unit}` })));
  add("equipment", "Equipment", tables.equipment.filter((row) => isDemoManager(role) || equipmentLocations.has(row.location)).map((row) => ({ id: row.id, title: row.name, detail: `${row.code} · ${row.location}` })));
  add("workforce", "Employee", tables.employees.map((row) => ({ id: row.id, title: row.name, detail: row.trade })));
  add("suppliers", "Supplier", tables.suppliers.map((row) => ({ id: row.id, title: row.name, detail: row.category })));
  add("reports", "Daily report", tables.dailyReports.filter((row) => projectIds.has(row.projectId)).map((row) => ({ id: row.id, title: tables.projects.find((project) => project.id === row.projectId)?.name ?? "Project", detail: `${row.date} · ${row.summary}` })));
  add("users", "User", tables.users.map((row) => ({ id: row.id, title: row.name, detail: row.role.replaceAll("_", " ") })));
  if (visible("requests")) for (const request of tables.materialRequests) {
    if (request.legacy) continue;
    const permitted = isDemoManager(role) || role === "warehouse_staff" && request.status === "approved" && tables.warehouseMemberships.some((row) => row.userId === userId && row.warehouseId === request.warehouseId) || tables.projectAssignments.some((row) => row.userId === userId && row.projectId === request.projectId);
    if (!permitted) continue;
    const material = tables.materials.find((row) => row.id === request.materialId)?.name ?? "Material";
    const project = tables.projects.find((row) => row.id === request.projectId)?.name ?? "Project";
    if (matches(`request ${material} ${project} ${request.purpose}`)) records.push({ id: `request-${request.id}`, type: "Record", title: `${material} request`, detail: `${project} · ${request.purpose}`, href: "/demo?view=requests" });
  }
  return [...pages, ...actions, ...guides, ...records].slice(0, 80);
}
