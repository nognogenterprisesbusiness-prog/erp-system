import { z } from "zod";
import { uuidSchema } from "./common";

export const postAttendanceSchema = z.object({
  idempotencyKey: uuidSchema,
  projectId: uuidSchema,
  assignmentId: uuidSchema,
  workDate: z.iso.date(),
  status: z.enum(["present", "absent"]),
  hours: z.string().trim().regex(/^\d{1,2}(\.\d{1,2})?$/, "Enter hours with up to two decimal places"),
  rateType: z.enum(["hourly", "daily", "none"]),
  dayFraction: z.string().trim(),
  note: z.string().trim().min(3).max(500),
}).superRefine((value, context) => {
  const hours = Number(value.hours);
  if (value.status === "absent") {
    if (hours !== 0 || value.rateType !== "none" || value.dayFraction !== "") context.addIssue({ code: "custom", path: ["hours"], message: "Absent attendance has no hours or rate" });
    return;
  }
  if (hours <= 0 || hours > 24 || value.rateType === "none") context.addIssue({ code: "custom", path: ["hours"], message: "Enter worked hours and a rate type" });
  if (value.rateType === "daily" && (!/^0?\.\d{1,4}$|^1(\.0{1,4})?$/.test(value.dayFraction) || Number(value.dayFraction) <= 0))
    context.addIssue({ code: "custom", path: ["dayFraction"], message: "Enter a paid-day fraction between 0 and 1" });
  if (value.rateType === "hourly" && value.dayFraction !== "") context.addIssue({ code: "custom", path: ["dayFraction"], message: "Day fraction is only for daily rates" });
});

export const reverseAttendanceSchema = z.object({
  idempotencyKey: uuidSchema,
  projectId: uuidSchema,
  attendanceId: uuidSchema,
  reason: z.string().trim().min(3).max(500),
});
