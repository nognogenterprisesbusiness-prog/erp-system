import { z } from "zod";
import { optionalTextSchema, uuidSchema } from "./common";

export const employeeStatuses = ["active", "inactive", "on_leave", "separated"] as const;
export const registryEmployeeStatuses = ["active", "inactive", "on_leave"] as const;
export const laborRateTypes = ["hourly", "daily"] as const;

const phoneSchema = z.string().trim().min(7, "Enter a contact number").max(40).regex(/^[0-9+() .-]+$/, "Enter a valid contact number");
const moneySchema = z.string().trim().regex(/^\d+(\.\d{1,2})?$/, "Enter a positive amount with up to two decimal places").refine((value) => Number(value) > 0, "Rate must be greater than zero");

export const employeeCategoryInputSchema = z.object({
  id: uuidSchema.optional(),
  name: z.string().trim().min(2).max(120),
  description: optionalTextSchema,
});

export const employeeInputSchema = z.object({
  id: uuidSchema.optional(),
  code: z.string().trim().min(2).max(32).regex(/^[A-Z0-9-]+$/, "Use uppercase letters, numbers, and hyphens only"),
  firstName: z.string().trim().min(2).max(80),
  middleName: z.string().trim().max(80),
  lastName: z.string().trim().min(2).max(80),
  contactNumber: phoneSchema,
  emailAddress: z.union([z.email().max(320), z.literal("")]),
  categoryId: uuidSchema,
  employmentType: z.string().trim().min(2).max(80),
  status: z.enum(registryEmployeeStatuses),
  hireDate: z.iso.date(),
  profileId: z.union([uuidSchema, z.literal("")]),
});

export const workforceAssignmentInputSchema = z.object({
  employeeId: uuidSchema,
  projectId: uuidSchema,
  projectSiteId: uuidSchema,
  positionTitle: z.string().trim().min(2).max(120),
  startDate: z.iso.date(),
  remarks: optionalTextSchema,
});

export const endWorkforceAssignmentInputSchema = z.object({
  assignmentId: uuidSchema,
  endDate: z.iso.date(),
  remarks: optionalTextSchema,
});

export const transferWorkforceAssignmentInputSchema = z.object({
  assignmentId: uuidSchema,
  projectId: uuidSchema,
  projectSiteId: uuidSchema,
  positionTitle: z.string().trim().min(2).max(120),
  currentEndDate: z.iso.date(),
  newStartDate: z.iso.date(),
  remarks: optionalTextSchema,
}).refine((value) => value.currentEndDate < value.newStartDate, {
  path: ["newStartDate"],
  message: "The new assignment must start after the current assignment ends",
});

export const laborRateInputSchema = z.object({
  employeeId: uuidSchema,
  rateType: z.enum(laborRateTypes),
  amount: moneySchema,
  effectiveStartDate: z.iso.date(),
  effectiveEndDate: z.union([z.iso.date(), z.literal("")]),
}).refine((value) => !value.effectiveEndDate || value.effectiveEndDate >= value.effectiveStartDate, {
  path: ["effectiveEndDate"],
  message: "End date cannot be before the start date",
});

export const closeLaborRateInputSchema = z.object({
  rateId: uuidSchema,
  effectiveEndDate: z.iso.date(),
});

export type EmployeeInput = z.infer<typeof employeeInputSchema>;
export type EmployeeCategoryInput = z.infer<typeof employeeCategoryInputSchema>;
export type WorkforceAssignmentInput = z.infer<typeof workforceAssignmentInputSchema>;
export type LaborRateInput = z.infer<typeof laborRateInputSchema>;
