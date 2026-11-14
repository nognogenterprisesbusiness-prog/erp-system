import type { AppRole } from "@/types/database";

export const invitableRoles = ["engineer", "foreman", "warehouse_staff", "finance", "driver", "hr"] as const satisfies readonly AppRole[];

export const roleLabels: Record<AppRole, string> = {
  admin: "Admin",
  engineer: "Engineer",
  foreman: "Foreman",
  warehouse_staff: "Warehouse staff",
  finance: "Finance",
  driver: "Driver",
  hr: "HR",
};

export function workspaceHomeHref(roles: readonly AppRole[]) {
  if (roles.some(role => role === "admin" || role === "finance" || role === "engineer" || role === "foreman" || role === "hr")) return "/dashboard";
  if (roles.includes("warehouse_staff")) return "/inventory";
  return roles.includes("driver") ? "/driver-account" : "/dashboard";
}

export function workforceAccess(roles: readonly AppRole[]) {
  return {
    canManageEmployees: roles.some(role => role === "admin" || role === "hr"),
    canViewPayroll: roles.some(role => role === "admin" || role === "finance" || role === "hr"),
    workforceOnly: roles.includes("hr") && !roles.some(role => role !== "hr" && role !== "driver"),
  };
}

export function userRoleLabel(roles: readonly AppRole[]) {
  return (Object.keys(roleLabels) as AppRole[]).filter(role => roles.includes(role)).map(role => roleLabels[role]).join(", ") || "Team member";
}

export function canAssignInitialRole(actorRoles: readonly AppRole[], role: AppRole) {
  return actorRoles.includes("admin") && role !== "admin";
}

export function canManageAccount(actorId: string, actorRoles: readonly AppRole[], targetId: string, targetRoles: readonly AppRole[]) {
  return actorId !== targetId && actorRoles.includes("admin") && !targetRoles.includes("admin");
}
