import "server-only";
import { cache } from "react";
import { notFound, redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import type { AppRole, ProfileRow } from "@/types/database";

export type UserContext = { userId: string; profile: ProfileRow; roles: AppRole[]; canManage: boolean; canOperateInventory: boolean; canViewLaborRates: boolean; canViewProcurement: boolean; canViewDailyReports: boolean };

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
  const canManage = roles.includes("admin");
  const canViewFinance = canManage || roles.includes("finance");
  return { userId, profile, roles, canManage, canOperateInventory: canManage || roles.includes("warehouse_staff"), canViewLaborRates: canViewFinance, canViewProcurement: canManage, canViewDailyReports: canManage || roles.some((role) => role === "engineer" || role === "foreman") };
});

export async function requireManager() {
  const context = await requireUser();
  if (!context.canManage) throw new Error("You do not have permission to perform this action.");
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
