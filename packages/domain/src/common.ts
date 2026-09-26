import { z } from "zod";

// PostgreSQL UUID keys include persisted fixtures without RFC version/variant bits.
export const uuidSchema = z.guid("Invalid identifier");
export const optionalTextSchema = z.string().trim().max(2_000).optional().or(z.literal(""));
export const phoneSchema = z.string().trim().max(40).optional().or(z.literal(""));
export const moneySchema = z
  .string()
  .trim()
  .regex(/^\d+(\.\d{1,2})?$/, "Enter a valid non-negative amount with up to two decimal places");

export type ActionResult<T = undefined> =
  | { ok: true; data: T }
  | { ok: false; message: string; fieldErrors?: Record<string, string[]> };
