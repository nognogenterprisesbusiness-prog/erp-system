import { z } from "zod";
import { uuidSchema } from "./common";

export const dailyReportStatuses = ["draft", "submitted", "pending_review", "approved", "rejected", "requires_revision"] as const;

export const dailyReportInputSchema = z.object({
  id: uuidSchema,
  projectId: uuidSchema,
  projectSiteId: uuidSchema,
  reportDate: z.iso.date(),
  weatherConditions: z.string().trim().max(300),
  workDescription: z.string().trim().max(5000),
  accomplishments: z.string().trim().max(5000),
  issuesEncountered: z.string().trim().max(5000),
  siteObservations: z.string().trim().max(5000),
  generalRemarks: z.string().trim().max(5000),
  intent: z.enum(["draft", "submit"]),
}).superRefine((value, context) => {
  if (value.intent !== "submit") return;
  if (value.workDescription.length < 3) context.addIssue({ code: "custom", path: ["workDescription"], message: "Describe the work completed before submitting" });
  if (value.accomplishments.length < 3) context.addIssue({ code: "custom", path: ["accomplishments"], message: "Record accomplishments before submitting" });
});

export type DailyReportInput = z.infer<typeof dailyReportInputSchema>;
