import { z } from "zod";

// Increment for an incompatible API contract, not a visual or additive release.
export const mobileProtocolVersion = 1;
export const legacyMobileProtocolVersion = 1;
const protocol = z.number().int().min(1).max(9999);
export const mobileUpdateUrlSchema = z.string().max(2048).url().refine((value) => {
  try {
    const url = new URL(value);
    return url.protocol === "https:" && !url.username && !url.password;
  } catch { return false; }
}, "Use a public HTTPS download or store URL");
export const mobileCompatibilitySchema = z.object({
  minimumProtocol: protocol,
  currentProtocol: protocol,
  updateUrls: z.object({ android: mobileUpdateUrlSchema.nullable(), ios: mobileUpdateUrlSchema.nullable() }),
}).refine((value) => value.minimumProtocol <= value.currentProtocol, "The minimum protocol cannot exceed the current protocol");
export type MobileCompatibility = z.infer<typeof mobileCompatibilitySchema>;
export const mobileUpdateRequiredSchema = z.object({
  code: z.literal("APP_UPDATE_REQUIRED"),
  compatibility: mobileCompatibilitySchema,
});

export function mobileProtocolStatus(version: number, policy: Pick<MobileCompatibility, "minimumProtocol" | "currentProtocol">) {
  if (!protocol.safeParse(version).success) return "invalid";
  if (version < policy.minimumProtocol) return "update_required";
  if (version > policy.currentProtocol) return "server_outdated";
  return "compatible";
}
