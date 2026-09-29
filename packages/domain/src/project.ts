import { z } from "zod";

import { moneySchema, optionalTextSchema, uuidSchema } from "./common";

export const projectStatuses = ["draft", "active", "on_hold", "completed", "cancelled"] as const;
export const projectStatusSchema = z.enum(projectStatuses);

export const assignmentRoles = ["engineer", "foreman"] as const;
export const assignmentRoleSchema = z.enum(assignmentRoles);
export const assignmentStatuses = ["active", "inactive"] as const;

const projectFields = z.object({
  code: z.string().trim().min(2).max(32).regex(/^[A-Z0-9-]+$/, "Use uppercase letters, numbers, and hyphens only"),
  name: z.string().trim().min(2).max(160),
  description: optionalTextSchema,
  clientName: z.string().trim().min(2).max(160),
  clientEmail: z.email().optional().or(z.literal("")),
  clientPhone: z.string().trim().regex(/^[0-9]{9,11}$/, "Enter 9 to 11 digits only").or(z.literal("")),
  address: z.string().trim().min(3).max(300),
  municipalityCode: z.string().regex(/^\d{10}$/, "Choose a city or municipality from the list"),
  startDate: z.iso.date(),
  targetCompletionDate: z.iso.date(),
  actualCompletionDate: z.iso.date().optional().or(z.literal("")),
  contractAmount: moneySchema,
  status: projectStatusSchema,
  projectManagerId: uuidSchema.optional().or(z.literal("")),
});

export const projectInputSchema = projectFields.superRefine((value, context) => {
  if (value.targetCompletionDate < value.startDate) {
    context.addIssue({ code: "custom", path: ["targetCompletionDate"], message: "Target completion cannot precede the start date" });
  }
  if (value.actualCompletionDate && value.actualCompletionDate < value.startDate) {
    context.addIssue({ code: "custom", path: ["actualCompletionDate"], message: "Actual completion cannot precede the start date" });
  }
});

export const projectUpdateSchema = projectInputSchema.and(z.object({ id: uuidSchema }));

export const projectAssignmentInputSchema = z.object({
  projectId: uuidSchema,
  userId: uuidSchema,
  role: assignmentRoleSchema,
  assignedOn: z.iso.date(),
});

export const projectSiteInputSchema = z.object({
  projectId: uuidSchema,
  name: z.string().trim().min(2).max(160),
  address: z.string().trim().min(3).max(300),
  description: optionalTextSchema,
  engineerId: uuidSchema.optional().or(z.literal("")),
  foremanId: uuidSchema.optional().or(z.literal("")),
  status: z.enum(["active", "inactive"]),
});

export type ProjectInput = z.infer<typeof projectInputSchema>;
export type ProjectUpdate = z.infer<typeof projectUpdateSchema>;
export type ProjectAssignmentInput = z.infer<typeof projectAssignmentInputSchema>;
export type ProjectSiteInput = z.infer<typeof projectSiteInputSchema>;
export type ProjectStatus = z.infer<typeof projectStatusSchema>;
export type AssignmentRole = z.infer<typeof assignmentRoleSchema>;
