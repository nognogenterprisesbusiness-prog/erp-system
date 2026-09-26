export type AppMode = "production" | "staging" | "local-demo";

export type RuntimeConfig = {
  mode: AppMode;
  dataProvider: "supabase" | "none";
  authentication: "supabase" | "none";
  externalEffects: boolean;
};

export function runtimeConfig(mode: AppMode): RuntimeConfig {
  return mode === "local-demo"
    ? { mode, dataProvider: "none", authentication: "none", externalEffects: false }
    : { mode, dataProvider: "supabase", authentication: "supabase", externalEffects: true };
}

export function configuredAppMode(): AppMode {
  const serverMode = process.env.APP_MODE;
  const publicMode = process.env.NEXT_PUBLIC_APP_MODE;
  if (serverMode && publicMode && serverMode !== publicMode) {
    throw new Error("APP_MODE and NEXT_PUBLIC_APP_MODE must match.");
  }
  const mode = publicMode ?? serverMode;
  if (mode === "production" || mode === "staging" || mode === "local-demo") return mode;
  throw new Error("APP_MODE must be explicitly set to production, staging, or local-demo.");
}

export function configuredRuntime(): RuntimeConfig {
  return runtimeConfig(configuredAppMode());
}
