import "server-only";

import { z } from "zod";
import { configuredAppMode } from "@/lib/app-mode";

const accountSchema = z.array(z.object({
  label: z.string().trim().min(2).max(40),
  email: z.email(),
  password: z.string().min(12),
}).strict()).min(2).max(12);

export type PreviewAccount = { label: string; email: string };

export function stagingPreviewAccounts() {
  if (process.env.STAGING_PREVIEW_ENABLED !== "true") return [];
  if (configuredAppMode() !== "staging") throw new Error("Preview account switching is only permitted in staging mode.");
  const stagingUrl = process.env.NEXT_PUBLIC_STAGING_SUPABASE_URL;
  if (!stagingUrl || stagingUrl === process.env.NEXT_PUBLIC_SUPABASE_URL) {
    throw new Error("Preview accounts require an isolated staging Supabase project.");
  }
  let raw: unknown;
  try {
    raw = JSON.parse(process.env.STAGING_PREVIEW_ACCOUNTS ?? "null");
  } catch {
    throw new Error("STAGING_PREVIEW_ACCOUNTS must be valid JSON.");
  }
  const parsed = accountSchema.safeParse(raw);
  if (!parsed.success) throw new Error("STAGING_PREVIEW_ACCOUNTS must contain 2–12 labeled test accounts with strong passwords.");
  const emails = parsed.data.map((account) => account.email.toLowerCase());
  if (new Set(emails).size !== emails.length) throw new Error("Preview account emails must be unique.");
  if (new Set(parsed.data.map((account) => account.password)).size !== parsed.data.length) {
    throw new Error("Every preview account needs a distinct password.");
  }
  return parsed.data;
}

export function visibleStagingPreviewAccounts(email: string): PreviewAccount[] {
  const accounts = stagingPreviewAccounts();
  if (!accounts.some((account) => account.email.toLowerCase() === email.toLowerCase())) return [];
  return accounts.map(({ label, email: accountEmail }) => ({ label, email: accountEmail }));
}
