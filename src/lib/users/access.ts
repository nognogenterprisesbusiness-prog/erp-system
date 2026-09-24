import type { AppRole } from "@/types/database";

export const invitableRoles = ["project_manager", "engineer", "foreman", "warehouse_staff", "accounting", "worker", "admin"] as const satisfies readonly AppRole[];

export const roleLabels: Record<AppRole, string> = {
  super_admin: "Super admin",
  owner: "Owner",
  admin: "Admin",
  project_manager: "Project manager",
  engineer: "Engineer",
  foreman: "Foreman",
  warehouse_staff: "Warehouse staff",
  accounting: "Accounting",
  worker: "Worker",
};

export function canAssignInitialRole(actorRoles: readonly AppRole[], role: AppRole) {
  const isManager = actorRoles.some((item) => item === "super_admin" || item === "owner" || item === "admin");
  if (!isManager || role === "super_admin" || role === "owner") return false;
  if (role === "admin") return actorRoles.includes("super_admin") || actorRoles.includes("owner");
  return true;
}

export function canManageAccount(actorId: string, actorRoles: readonly AppRole[], targetId: string, targetRoles: readonly AppRole[]) {
  if (actorId === targetId || !actorRoles.some((role) => ["super_admin", "owner", "admin"].includes(role))) return false;
  if (targetRoles.some((role) => role === "super_admin" || role === "owner")) return false;
  if (targetRoles.includes("admin")) return actorRoles.includes("super_admin") || actorRoles.includes("owner");
  return true;
}
