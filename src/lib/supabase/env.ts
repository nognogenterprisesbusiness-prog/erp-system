import { configuredRuntime } from "@/lib/app-mode";

export function getSupabaseEnv() {
  const { mode, dataProvider } = configuredRuntime();
  if (dataProvider !== "supabase") {
    throw new Error("Supabase is disabled in local-demo mode.");
  }
  const url = mode === "staging" ? process.env.NEXT_PUBLIC_STAGING_SUPABASE_URL : process.env.NEXT_PUBLIC_SUPABASE_URL;
  const publishableKey = mode === "staging" ? process.env.NEXT_PUBLIC_STAGING_SUPABASE_PUBLISHABLE_KEY : process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY;
  if (!url || !publishableKey) throw new Error(`Missing Supabase configuration for ${mode}. No other environment was used.`);
  return { url, publishableKey };
}
