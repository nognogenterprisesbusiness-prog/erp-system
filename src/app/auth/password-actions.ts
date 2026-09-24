"use server";

import { redirect } from "next/navigation";
import { z } from "zod";

import { getAppSiteUrl, createAdminClient } from "@/lib/supabase/admin";
import { createClient } from "@/lib/supabase/server";

export type PasswordActionState = { ok: boolean; message: string };
const invalid = (message: string): PasswordActionState => ({ ok: false, message });
const passwordSchema = z.object({ password: z.string().min(12).max(128), confirmPassword: z.string() }).refine((data) => data.password === data.confirmPassword);

async function completePendingOnboarding(userId: string): Promise<boolean> {
  let admin;
  try { admin = createAdminClient(); } catch { return false; }
  const { data, error } = await admin.from("profiles").update({ onboarding_required: false, is_active: true })
    .eq("id", userId).eq("onboarding_required", true).select("id").single();
  return !error && Boolean(data);
}

export async function requestPasswordResetAction(_: PasswordActionState, form: FormData): Promise<PasswordActionState> {
  const email = z.email().safeParse(String(form.get("email") ?? "").trim().toLowerCase());
  if (!email.success) return invalid("Enter a valid email address.");
  let redirectTo;
  try { redirectTo = new URL("/auth/reset-password", getAppSiteUrl()).toString(); }
  catch { return invalid("Password recovery is not configured for this environment."); }
  const supabase = await createClient();
  await supabase.auth.resetPasswordForEmail(email.data, { redirectTo });
  return { ok: true, message: "If this account exists, a password-reset link has been sent." };
}

export async function setInvitedPasswordAction(_: PasswordActionState, form: FormData): Promise<PasswordActionState> {
  const parsed = passwordSchema.safeParse({ password: form.get("password"), confirmPassword: form.get("confirmPassword") });
  if (!parsed.success) return invalid("Use at least 12 characters and enter the same password twice.");
  const supabase = await createClient();
  const { data: claims } = await supabase.auth.getClaims();
  const userId = typeof claims?.claims?.sub === "string" ? claims.claims.sub : null;
  if (!userId) return invalid("Your invitation session has expired. Please open the invitation link again.");
  const { data: profile, error: profileError } = await supabase.from("profiles").select("is_active,onboarding_required").eq("id", userId).single();
  if (profileError || !profile?.onboarding_required) return invalid("This invitation is not pending password setup.");
  const { error: passwordError } = await supabase.auth.updateUser({ password: parsed.data.password });
  if (passwordError) return invalid("The password could not be saved. Try a stronger password or request another invitation.");
  if (!(await completePendingOnboarding(userId))) return invalid("Password saved, but account setup needs administrator attention.");
  redirect("/dashboard");
}

export async function resetPasswordAction(_: PasswordActionState, form: FormData): Promise<PasswordActionState> {
  const parsed = passwordSchema.safeParse({ password: form.get("password"), confirmPassword: form.get("confirmPassword") });
  if (!parsed.success) return invalid("Use at least 12 characters and enter the same password twice.");
  const supabase = await createClient();
  const { data: claims } = await supabase.auth.getClaims();
  const userId = typeof claims?.claims?.sub === "string" ? claims.claims.sub : null;
  if (!userId) return invalid("Your reset link has expired. Please request another one.");
  const { error } = await supabase.auth.updateUser({ password: parsed.data.password });
  if (error) return invalid("The password could not be saved. Try a stronger password or request another reset link.");
  const { data: profile, error: profileError } = await supabase.from("profiles").select("onboarding_required").eq("id", userId).single();
  if (profileError || !profile) return invalid("Password saved, but this account needs administrator attention.");
  if (profile.onboarding_required && !(await completePendingOnboarding(userId))) return invalid("Password saved, but account setup needs administrator attention.");
  redirect("/dashboard");
}
