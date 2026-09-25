import type { DemoRole } from "./schema";

export const demoViewNames = ["overview", "projects", "warehouses", "inventory", "requests", "equipment", "equipment-requests", "workforce", "attendance", "suppliers", "reports", "qr", "users", "audit", "settings", "help"] as const;
export type DemoView = (typeof demoViewNames)[number];

export const demoPages = [
  { id: "overview", label: "Overview", keywords: "dashboard metrics activity" },
  { id: "projects", label: "Projects", keywords: "ongoing recent sites" },
  { id: "warehouses", label: "Warehouses", keywords: "locations branches multiple warehouse" },
  { id: "inventory", label: "Inventory", keywords: "materials stock balances stock in" },
  { id: "requests", label: "Material requests", keywords: "approval dispatch receipt site consumption project cost" },
  { id: "equipment", label: "Equipment", keywords: "assets vehicles registry" },
  { id: "equipment-requests", label: "Equipment handovers", keywords: "equipment request approval checkout return custody" },
  { id: "workforce", label: "Employees", keywords: "workforce profile photo" },
  { id: "attendance", label: "Attendance", keywords: "labor labour workers hours wage site present absent" },
  { id: "suppliers", label: "Suppliers", keywords: "vendors" },
  { id: "reports", label: "Daily reports", keywords: "site updates" },
  { id: "qr", label: "QR codes", keywords: "generate view print labels materials equipment warehouses sites" },
  { id: "users", label: "Users", keywords: "add user accounts roles access" },
  { id: "audit", label: "Audit logs", keywords: "history actor changes approvals inventory audit trail" },
  { id: "settings", label: "Settings", keywords: "snapshot export import reset demo data" },
  { id: "help", label: "Help centre", keywords: "guide tutorials how to" },
] as const satisfies readonly { id: DemoView; label: string; keywords: string }[];

const managerViews = demoPages.map((page) => page.id) as DemoView[];
export const demoRoleViews: Record<DemoRole, readonly DemoView[]> = {
  super_admin: managerViews,
  owner: managerViews,
  admin: managerViews,
  project_manager: ["overview", "projects", "requests", "equipment", "equipment-requests", "reports", "help", "settings"],
  engineer: ["overview", "projects", "requests", "equipment", "equipment-requests", "reports", "help", "settings"],
  foreman: ["overview", "projects", "requests", "equipment-requests", "reports", "help", "settings"],
  warehouse_staff: ["overview", "warehouses", "inventory", "requests", "equipment", "help", "settings"],
  accounting: ["overview", "projects", "attendance", "suppliers", "reports", "help", "settings"],
  worker: ["overview", "help", "settings"],
};

export function demoHref(view: DemoView): string {
  return view === "overview" ? "/demo" : `/demo?view=${view}`;
}

export function isDemoView(value: unknown): value is DemoView {
  return typeof value === "string" && demoViewNames.some((name) => name === value);
}
