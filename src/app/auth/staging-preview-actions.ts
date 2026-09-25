"use server";

import { redirect } from "next/navigation";
import { z } from "zod";
import { createClient } from "@/lib/supabase/server";
import { stagingPreviewAccounts } from "@/lib/staging-preview";

export type PreviewSwitchState = { message: string };

export async function switchStagingPreviewAccount(_: PreviewSwitchState, formData: FormData): Promise<PreviewSwitchState> {
  const accounts = stagingPreviewAccounts();
  if (!accounts.length) return { message: "Account switching is unavailable." };
  const parsed = z.email().safeParse(formData.get("accountEmail"));
  if (!parsed.success) return { message: "Choose a preview account." };
  const target = accounts.find((account) => account.email.toLowerCase() === parsed.data.toLowerCase());
  if (!target) return { message: "This preview account is not configured." };
  const supabase = await createClient();
  const { data: current, error: currentError } = await supabase.auth.getUser();
  if (currentError || !current.user?.email || !accounts.some((account) => account.email.toLowerCase() === current.user.email!.toLowerCase())) {
    return { message: "Sign in with an authorized staging preview account first." };
  }
  if (current.user.email.toLowerCase() === target.email.toLowerCase()) return { message: "This account is already selected." };
  const { error } = await supabase.auth.signInWithPassword({ email: target.email, password: target.password });
  if (error) return { message: "Could not switch accounts. Verify the staging account configuration." };
  redirect("/dashboard");
}
