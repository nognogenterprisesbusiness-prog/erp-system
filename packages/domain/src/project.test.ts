import assert from "node:assert/strict";
import { test } from "node:test";

import { projectInputSchema } from "./project";

const project = {
  code: "PRJ-TEST",
  name: "Test project",
  description: "",
  clientName: "Test client",
  clientEmail: "",
  clientPhone: "09123456789",
  address: "Test address",
  municipalityCode: "1234567890",
  startDate: "2026-09-01",
  targetCompletionDate: "2026-09-02",
  actualCompletionDate: "",
  contractAmount: "100",
  initialBudget: "80",
  status: "draft",
  projectManagerId: "",
} as const;

test("project client phone is optional or 9 to 11 digits only", () => {
  for (const phone of ["", "123456789", "09123456789"]) {
    assert.equal(projectInputSchema.safeParse({ ...project, clientPhone: phone }).success, true, phone);
  }
  for (const phone of ["12345678", "123456789012", "(032) 000 0001", "09123abc789"]) {
    assert.equal(projectInputSchema.safeParse({ ...project, clientPhone: phone }).success, false, phone);
  }
});

test("project dates cannot end before work begins", () => {
  assert.equal(projectInputSchema.safeParse(project).success, true);
  assert.equal(projectInputSchema.safeParse({ ...project, targetCompletionDate: "2026-08-31" }).success, false);
  assert.equal(projectInputSchema.safeParse({ ...project, actualCompletionDate: "2026-08-31" }).success, false);
});
