import type { AppRole } from "@/types/database";

export const invitableRoles = ["engineer", "foreman", "warehouse_staff", "finance"] as const satisfies readonly AppRole[];

export const roleLabels: Record<AppRole, string> = {
  admin: "Admin",
  engineer: "Engineer",
  foreman: "Foreman",
  warehouse_staff: "Warehouse staff",
  finance: "Finance",
};

export function canAssignInitialRole(actorRoles: readonly AppRole[], role: AppRole) {
  return actorRoles.includes("admin") && role !== "admin";
}

export function canManageAccount(actorId: string, actorRoles: readonly AppRole[], targetId: string, targetRoles: readonly AppRole[]) {
  return actorId !== targetId && actorRoles.includes("admin") && !targetRoles.includes("admin");
}
