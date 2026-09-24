import { z } from "zod";
import { uuidSchema } from "./common";

export const notificationTypeCodes = [
  "MATERIAL_REQUEST", "INVENTORY", "EQUIPMENT", "VEHICLE", "LABOR", "ATTENDANCE",
  "PROCUREMENT", "DAILY_REPORT", "PROJECT_PROGRESS", "FINANCIAL", "SYSTEM",
] as const;
export const notificationPriorities = ["low", "normal", "high"] as const;

export const notificationTypeSchema = z.enum(notificationTypeCodes);
export const notificationPrioritySchema = z.enum(notificationPriorities);
export const notificationIdSchema = uuidSchema;
export const notificationListQuerySchema = z.object({
  unread: z.enum(["0", "1"]).optional().default("0"),
  page: z.coerce.number().int().min(1).max(10_000).optional().default(1),
});

export type NotificationTypeCode = z.infer<typeof notificationTypeSchema>;
export type NotificationPriority = z.infer<typeof notificationPrioritySchema>;
