import "server-only";
import { cache } from "react";
import { notFound, redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import type { AppRole, ProfileRow } from "@/types/database";
import { workforceAccess } from "@/lib/users/access";

export type UserContext = { userId: string; profile: ProfileRow; roles: AppRole[]; canManage: boolean; canManageEmployees: boolean; canViewPayroll: boolean; workforceOnly: boolean; canOperateInventory: boolean; canViewLaborRates: boolean; canViewProcurement: boolean; canViewDailyReports: boolean };

export const requireUser = cache(async function requireUser(): Promise<UserContext> {
  const supabase = await createClient();
  const { data } = await supabase.auth.getClaims();
  const userId = typeof data?.claims?.sub === "string" ? data.claims.sub : null;
  if (!userId) redirect("/");
  const [{ data: profile, error: profileError }, { data: roleRows, error: roleError }] = await Promise.all([
    supabase.from("profiles").select("id,full_name,email,phone,avatar_path,is_active,onboarding_required,created_at,updated_at").eq("id", userId).single(),
    supabase.from("user_roles").select("role").eq("user_id", userId),
  ]);
  const roles = (roleRows ?? []).map((row) => row.role);
  if (profileError || roleError || !profile) redirect("/?error=account");
  if (profile.onboarding_required) redirect("/auth/accept-invite");
  if (!profile.is_active || roles.length === 0) redirect("/?error=account");
  if (roles.includes("driver") && roles.length === 1) redirect("/driver-account");
  const canManage = roles.includes("admin");
  const canViewFinance = canManage || roles.includes("finance");
  // Finance reads purchasing; every purchasing change stays Admin-only.
  return { userId, profile, roles, canManage, ...workforceAccess(roles), canOperateInventory: canManage || roles.includes("warehouse_staff"), canViewLaborRates: canViewFinance, canViewProcurement: canViewFinance, canViewDailyReports: canManage || roles.some((role) => role === "engineer" || role === "foreman") };
});

export async function requireManager() {
  const context = await requireUser();
  if (!context.canManage) throw new Error("You do not have permission to perform this action.");
  return context;
}

export async function requireManagerPage() {
  const context = await requireUser();
  if (!context.canManage) notFound();
  return context;
}

export async function requireWorkforceManager() {
  const context = await requireUser();
  if (!context.canManageEmployees) throw new Error("Employee management access is required.");
  return context;
}

export async function requireWorkforceManagerPage() {
  const context = await requireUser();
  if (!context.canManageEmployees) notFound();
  return context;
}

export async function requireOperationalViewer() {
  const context = await requireUser();
  if (context.workforceOnly) notFound();
  return context;
}

export async function requirePayrollViewer() {
  const context = await requireUser();
  if (!context.canViewPayroll) notFound();
  return context;
}

export async function requireProcurementViewer() {
  const context = await requireUser();
  if (!context.canViewProcurement) notFound();
  return context;
}

export async function requireFinanceViewer() {
  const context = await requireUser();
  if (!context.canViewLaborRates) notFound();
  return context;
}

export async function requireDailyReportViewer() {
  const context = await requireUser();
  if (!context.canViewDailyReports) notFound();
  return context;
}
