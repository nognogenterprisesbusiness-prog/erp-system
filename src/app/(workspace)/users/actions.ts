"use server";

import { revalidatePath } from "next/cache";
import { z } from "zod";
import { uuidSchema } from "@nognog/domain";

import { requireManager } from "@/lib/auth";
import { canAssignInitialRole, canManageAccount, invitableRoles } from "@/lib/users/access";
import { createAdminClient, getAppSiteUrl } from "@/lib/supabase/admin";
import { createClient } from "@/lib/supabase/server";

export type UserActionState = { ok: boolean; message: string };
const failure = (message: string): UserActionState => ({ ok: false, message });
const invitationSchema = z.object({
  fullName: z.string().trim().min(2).max(160),
  email: z.string().trim().toLowerCase().pipe(z.email().max(320)),
  role: z.enum(invitableRoles),
});
const assignmentSchema = z.object({ userId: uuidSchema, role: z.enum(invitableRoles) });
const statusSchema = z.object({ userId: uuidSchema, isActive: z.enum(["true", "false"]) });
const resetSchema = z.object({ userId: uuidSchema });
const value = (form: FormData, key: string) => String(form.get(key) ?? "");

export async function inviteUserAction(_: UserActionState, form: FormData): Promise<UserActionState> {
  let actor;
  try { actor = await requireManager(); } catch { return failure("You do not have permission to invite users."); }
  const parsed = invitationSchema.safeParse({ fullName: value(form, "fullName"), email: value(form, "email"), role: value(form, "role") });
  if (!parsed.success) return failure("Enter a valid name, email address, and permitted role.");
  if (!canAssignInitialRole(actor.roles, parsed.data.role)) return failure("You cannot assign that role.");

  let admin;
  let redirectTo;
  try {
    admin = createAdminClient();
    redirectTo = new URL("/auth/accept-invite", getAppSiteUrl()).toString();
  } catch { return failure("Account invitations are not configured for this environment."); }

  const { data, error } = await admin.auth.admin.inviteUserByEmail(parsed.data.email, {
    data: { full_name: parsed.data.fullName },
    redirectTo,
  });
  if (error || !data.user?.id) return failure("Invitation could not be sent. Check the address and email configuration.");

  const supabase = await createClient();
  const { error: roleError } = await supabase.rpc("assign_initial_user_role", { p_user_id: data.user.id, p_role: parsed.data.role });
  revalidatePath("/users");
  if (roleError) return failure("Invitation was sent, but its role could not be assigned. This user cannot access the ERP yet; assign a role from the Users list.");
  return { ok: true, message: `Invitation sent to ${parsed.data.email}. The user will choose their own password.` };
}

export async function assignInitialRoleAction(_: UserActionState, form: FormData): Promise<UserActionState> {
  let actor;
  try { actor = await requireManager(); } catch { return failure("You do not have permission to assign roles."); }
  const parsed = assignmentSchema.safeParse({ userId: value(form, "userId"), role: value(form, "role") });
  if (!parsed.success || !canAssignInitialRole(actor.roles, parsed.data.role)) return failure("Choose a permitted role.");
  const supabase = await createClient();
  const { error } = await supabase.rpc("assign_initial_user_role", { p_user_id: parsed.data.userId, p_role: parsed.data.role });
  if (error) return failure(error.code === "23505" ? "This user already has a role." : "The initial role could not be assigned.");
  revalidatePath("/users");
  return { ok: true, message: "Initial role assigned." };
}

export async function setUserActiveAction(_: UserActionState, form: FormData): Promise<UserActionState> {
  let actor;
  try { actor = await requireManager(); } catch { return failure("You do not have permission to manage users."); }
  const parsed = statusSchema.safeParse({ userId: value(form, "userId"), isActive: value(form, "isActive") });
  if (!parsed.success) return failure("Invalid account status change.");
  const supabase = await createClient();
  const { data: roles, error: rolesError } = await supabase.from("user_roles").select("role").eq("user_id", parsed.data.userId);
  if (rolesError || !canManageAccount(actor.userId, actor.roles, parsed.data.userId, (roles ?? []).map((row) => row.role))) {
    return failure("You cannot change this account.");
  }
  const { error } = await supabase.rpc("set_managed_user_active", { p_user_id: parsed.data.userId, p_is_active: parsed.data.isActive === "true" });
  if (error) return failure("Account status could not be changed.");
  revalidatePath("/users");
  return { ok: true, message: parsed.data.isActive === "true" ? "Account reactivated." : "Account deactivated." };
}

export async function sendManagedPasswordResetAction(_: UserActionState, form: FormData): Promise<UserActionState> {
  let actor;
  try { actor = await requireManager(); } catch { return failure("You do not have permission to manage users."); }
  const parsed = resetSchema.safeParse({ userId: value(form, "userId") });
  if (!parsed.success) return failure("Invalid account.");
  const supabase = await createClient();
  const [{ data: target, error: targetError }, { data: roles, error: rolesError }] = await Promise.all([
    supabase.from("profiles").select("id,email,is_active,onboarding_required").eq("id", parsed.data.userId).maybeSingle(),
    supabase.from("user_roles").select("role").eq("user_id", parsed.data.userId),
  ]);
  if (targetError || rolesError || !target || !canManageAccount(actor.userId, actor.roles, target.id, (roles ?? []).map((row) => row.role))) return failure("You cannot reset this account.");
  if (!target.is_active || target.onboarding_required) return failure("This account must be active and fully onboarded before requesting a reset.");
  let redirectTo: string;
  try { redirectTo = new URL("/auth/reset-password", getAppSiteUrl()).toString(); }
  catch { return failure("Password recovery is not configured for this environment."); }
  const { error } = await supabase.auth.resetPasswordForEmail(target.email, { redirectTo });
  if (error) return failure("A reset link could not be requested. Check email delivery settings or try again later.");
  return { ok: true, message: `A password-reset link was requested for ${target.email}.` };
}
