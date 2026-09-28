import { z } from "zod";
import { uuidSchema } from "./common";
import {
  submitMaterialRequestSchema,
  decideMaterialRequestSchema,
  receiveRequestTransferSchema,
  cancelMaterialRequestSchema,
} from "./material-requests";
import { siteConsumptionInputSchema } from "./inventory";
import { equipmentRequestInputSchema } from "./assets";
import { equipmentUsageSchema } from "./project-costs";
import {
  dailyReportInputSchema,
  dailyReportReviewSchema,
} from "./daily-reports";
import { projectProgressInputSchema } from "./project-operations";

const number = z.coerce.number().finite();
const text = z.string().nullable();
const page = <T extends z.ZodType>(item: T) =>
  z.object({
    items: z.array(item),
    count: number,
    page: number,
    pageSize: number,
  });
export const mobileQuerySchema = z.object({
  page: z.coerce.number().int().min(1).max(10000).default(1),
  search: z.string().trim().max(100).default(""),
  projectId: uuidSchema.optional(),
  siteId: uuidSchema.optional(),
  id: uuidSchema.optional(),
  date: z.iso.date().optional(),
  linked: z.enum(["true", "false"]).default("true"),
  identifier: z.string().trim().max(200).optional(),
});
export const mobileRoles = ["foreman", "engineer"] as const;
const project = z.object({
  id: uuidSchema,
  code: z.string(),
  name: z.string(),
  address: z.string(),
  description: text,
  status: z.string(),
  start_date: z.string(),
  target_completion_date: z.string(),
  photo_path: text,
  progress: number.nullable(),
  assignment_role: z.enum(mobileRoles),
  site_permissions: z.array(
    z.object({
      id: uuidSchema,
      can_record: z.boolean(),
      can_review: z.boolean(),
    }),
  ),
});
const site = z.object({
  id: uuidSchema,
  project_id: uuidSchema,
  name: z.string(),
  address: z.string(),
  description: text,
  status: z.string(),
  location_id: uuidSchema.nullable(),
});
const choice = z.object({ id: uuidSchema, name: z.string() });
const request = z.object({
  id: uuidSchema,
  request_number: z.string(),
  project_id: uuidSchema,
  project_site_id: uuidSchema,
  required_date: z.string(),
  purpose: z.string(),
  status: z.string(),
  requested_by: uuidSchema,
  source_warehouse_name: z.string(),
  requested_at: z.string(),
  decision_reason: text,
});
const requestLine = z.object({
  id: uuidSchema,
  material_id: uuidSchema,
  unit_of_measure_id: uuidSchema,
  requested_quantity: number,
  approved_quantity: number,
  name: z.string(),
  unit: z.string(),
});
const report = z.object({
  id: uuidSchema,
  report_number: z.string(),
  project_id: uuidSchema,
  project_site_id: uuidSchema,
  report_date: z.string(),
  prepared_by: uuidSchema,
  status: z.string(),
  work_description: z.string(),
  accomplishments: z.string(),
  weather_conditions: text,
  issues_encountered: text,
  site_observations: text,
  general_remarks: text,
  photo_path: text,
});
const event = z.object({
  id: uuidSchema,
  event_type: z.string(),
  occurred_at: z.string(),
});
export const mobileResponseSchemas = {
  session: z.object({
    id: uuidSchema,
    full_name: z.string(),
    email: z.string(),
    roles: z.array(z.enum(mobileRoles)),
    unread: number,
  }),
  projects: page(project),
  project: z.object({
    project,
    sites: z.array(site),
    personnel: z.array(
      z.object({ id: uuidSchema, name: z.string(), role: z.string() }),
    ),
    warehouses: z.array(choice),
  }),
  requests: page(request),
  request: z.object({
    request,
    lines: z.array(requestLine),
    dispatches: z.array(
      z.object({
        id: uuidSchema,
        request_line_id: uuidSchema,
        remaining: number,
        dispatched: number,
        received: number,
        variance: number,
      }),
    ),
    events: page(event),
  }),
  materials: page(
    z.object({
      id: uuidSchema,
      name: z.string(),
      unit_id: uuidSchema,
      unit: z.string(),
    }),
  ),
  inventory: page(
    z.object({
      id: uuidSchema,
      material_id: uuidSchema,
      name: z.string(),
      code: z.string(),
      unit_id: uuidSchema,
      unit: z.string(),
      on_hand: number,
      reserved: number,
      available: number,
    }),
  ),
  "inventory-history": page(
    z.object({
      id: uuidSchema,
      transaction_type: z.string(),
      transaction_date: z.string(),
      name: z.string(),
      quantity: number,
      unit: z.string(),
      remarks: text,
    }),
  ),
  equipment: page(
    z.object({
      id: uuidSchema,
      code: z.string(),
      name: z.string(),
      status: z.string(),
    }),
  ),
  "equipment-options": page(
    z.object({ id: uuidSchema, code: z.string(), name: z.string() }),
  ),
  "equipment-requests": page(
    z.object({
      id: uuidSchema,
      project_id: uuidSchema,
      project_site_id: uuidSchema,
      asset_id: uuidSchema,
      asset_code: z.string(),
      asset_name: z.string(),
      status: z.string(),
      needed_on: z.string(),
      expected_return_on: z.string(),
      purpose: z.string(),
      requested_by: uuidSchema,
    }),
  ),
  "equipment-history": page(
    z.object({
      id: uuidSchema,
      name: z.string(),
      date: z.string(),
      hours: number,
      note: z.string(),
      reversed: z.boolean(),
    }),
  ),
  workers: page(
    z.object({
      id: uuidSchema,
      employee_id: uuidSchema,
      name: z.string(),
      project_site_id: uuidSchema,
      basis: z.enum(["hourly", "daily"]).nullable(),
    }),
  ),
  attendance: page(
    z.object({
      id: uuidSchema,
      employee_id: uuidSchema,
      name: z.string(),
      project_site_id: uuidSchema,
      work_date: z.string(),
      attendance_status: z.string(),
      hours_worked: number,
      note: z.string(),
      reversed: z.boolean(),
    }),
  ),
  reports: page(report),
  report,
  "report-resources": page(
    z.object({
      resource_id: uuidSchema,
      kind: z.enum(["material", "attendance", "equipment"]),
      label: z.string(),
      quantity: number,
      unit: z.string(),
      reversed: z.boolean(),
      site_known: z.boolean(),
    }),
  ),
  notifications: page(
    z.object({
      id: uuidSchema,
      title: z.string(),
      message: z.string(),
      read_at: text,
      created_at: z.string(),
      entity_type: z.string(),
      entity_id: text,
      project_id: text,
    }),
  ),
  qr: z.object({
    entity_type: z.enum([
      "material",
      "equipment",
      "vehicle",
      "warehouse",
      "project_site",
    ]),
    entity_id: uuidSchema,
    name: z.string(),
    code: text,
    project_id: uuidSchema.nullable(),
  }),
};
export type MobileResource = keyof typeof mobileResponseSchemas;
export type MobileData<K extends MobileResource> = z.output<
  (typeof mobileResponseSchemas)[K]
>;
export type MobileQuery = z.output<typeof mobileQuerySchema>;

export const attendanceBatchSchema = z
  .object({
    projectId: uuidSchema,
    siteId: uuidSchema,
    workDate: z.iso.date(),
    entries: z
      .array(
        z
          .object({
            idempotencyKey: uuidSchema,
            assignmentId: uuidSchema,
            status: z.enum(["present", "absent"]),
            hours: z.string().regex(/^\d{1,2}(\.\d{1,2})?$/),
            dayFraction: z.enum(["", "0.5", "1"]),
            note: z.string().trim().min(3).max(500),
          })
          .superRefine((entry, ctx) => {
            if (
              (entry.status === "absent" &&
                (Number(entry.hours) !== 0 || entry.dayFraction !== "")) ||
              (entry.status === "present" &&
                (Number(entry.hours) <= 0 || Number(entry.hours) > 24))
            )
              ctx.addIssue({
                code: "custom",
                path: ["hours"],
                message: "Review the worker's attendance and hours.",
              });
          }),
      )
      .min(1)
      .max(100),
  })
  .refine(
    (value) =>
      new Set(value.entries.map((entry) => entry.assignmentId)).size ===
      value.entries.length,
    { path: ["entries"], message: "Select each worker only once." },
  );
export const idempotentEquipmentRequestSchema = z.object({
  idempotencyKey: uuidSchema,
  request: equipmentRequestInputSchema,
});
const command = <A extends string, T extends z.ZodType>(action: A, input: T) =>
  z.object({ action: z.literal(action), input });
export const mobileCommandSchema = z.discriminatedUnion("action", [
  command("request-materials", submitMaterialRequestSchema),
  command("decide-materials", decideMaterialRequestSchema),
  command("receive-materials", receiveRequestTransferSchema),
  command("cancel-materials", cancelMaterialRequestSchema),
  command("consume-materials", siteConsumptionInputSchema),
  command("request-equipment", idempotentEquipmentRequestSchema),
  command("record-equipment", equipmentUsageSchema),
  command("record-attendance", attendanceBatchSchema),
  command("save-report", dailyReportInputSchema),
  command("review-report", dailyReportReviewSchema),
  command("correct-report", z.object({ reportId: uuidSchema })),
  command("record-progress", projectProgressInputSchema),
  command(
    "link-resource",
    z.object({
      reportId: uuidSchema,
      resourceId: uuidSchema,
      kind: z.enum(["material", "attendance", "equipment"]),
      detach: z.boolean().default(false),
    }),
  ),
  command("read-notification", z.object({ id: uuidSchema, read: z.boolean() })),
  command("read-all-notifications", z.object({ read: z.boolean() })),
]);
export type MobileCommand = z.output<typeof mobileCommandSchema>;
export const mobileCommandResultSchema = z.object({
  id: z.string().optional(),
  ids: z.array(uuidSchema).optional(),
  message: z.string(),
});
export type MobileCommandResult = z.output<typeof mobileCommandResultSchema>;

export function mobileAccess(
  roles: readonly string[],
  active: boolean,
  onboarding: boolean,
) {
  return (
    active &&
    !onboarding &&
    !roles.includes("admin") &&
    roles.some((role) =>
      mobileRoles.includes(role as (typeof mobileRoles)[number]),
    )
  );
}
