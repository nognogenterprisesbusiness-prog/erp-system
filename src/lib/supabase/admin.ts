import "server-only";

import { createClient } from "@supabase/supabase-js";

import { configuredAppMode } from "@/lib/app-mode";
import type { Database } from "@/types/database";
import { getSupabaseEnv } from "./env";

export function createAdminClient() {
  const mode = configuredAppMode();
  const secret = mode === "staging" ? process.env.STAGING_SUPABASE_SECRET_KEY : process.env.SUPABASE_SECRET_KEY;
  if (!secret) throw new Error(`Missing server-only Supabase secret for ${mode}.`);
  const { url } = getSupabaseEnv();
  return createClient<Database>(url, secret, {
    auth: { persistSession: false, autoRefreshToken: false, detectSessionInUrl: false },
  });
}

export function getAppSiteUrl() {
  const raw = process.env.APP_SITE_URL;
  if (!raw) throw new Error("APP_SITE_URL is required for account invitations and password recovery.");
  const url = new URL(raw);
  if (url.username || url.password || url.search || url.hash || url.pathname !== "/") throw new Error("APP_SITE_URL must be a bare origin.");
  if (url.protocol !== "https:" && !(url.protocol === "http:" && ["localhost", "127.0.0.1"].includes(url.hostname))) {
    throw new Error("APP_SITE_URL must use HTTPS outside local development.");
  }
  return url;
}
