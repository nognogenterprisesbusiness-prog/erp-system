import assert from "node:assert/strict";
import { existsSync } from "node:fs";
import path from "node:path";
import { test } from "node:test";
import type { AppRole } from "@/types/database";
import { getManualGuides, manualGuides, roleResponsibilities } from "./manual";

test("manual topics respect role boundaries and combine multiple roles without duplicates", () => {
  const expected: Record<AppRole, string[]> = {
    admin: ["access", "deliveries", "purchases", "site-purchases", "finance", "corrections"],
    finance: ["purchases", "site-purchases", "finance"],
    engineer: ["requests", "sourcing", "site-purchases", "reports", "mobile"],
    foreman: ["requests", "sourcing", "reports", "mobile"],
    warehouse_staff: ["requests", "deliveries", "assets"],
  };
  for (const role of Object.keys(expected) as AppRole[]) {
    const ids = getManualGuides([role]).map((guide) => guide.id);
    for (const id of expected[role]) assert.ok(ids.includes(id), `${role}: ${id}`);
    for (const shared of ["start", "projects", "inventory", "account"]) assert.ok(ids.includes(shared));
    assert.ok(roleResponsibilities[role].boundary.length > 0);
    if (role !== "admin") for (const id of ["access", "corrections"]) assert.ok(!ids.includes(id));
    if (!["admin", "finance"].includes(role)) assert.ok(!ids.includes("finance") && !ids.includes("purchases"));
  }
  const combined = getManualGuides(["admin", "engineer"]);
  assert.equal(new Set(combined.map((guide) => guide.id)).size, combined.length);
  assert.deepEqual(getManualGuides([]), []);
});

test("manual search uses literal terms across instructions and preserves role filtering", () => {
  assert.ok(getManualGuides(["finance"], "  SUPPLIER   payment ").some((guide) => guide.id === "purchases"));
  assert.ok(getManualGuides(["engineer"], "receipt date").some((guide) => guide.id === "site-purchases"));
  assert.deepEqual(getManualGuides(["foreman"], "supplier-price posting"), []);
  assert.deepEqual(getManualGuides(["admin"], "[a-z]*"), []);
});

test("manual keeps existing anchors and uses real internal destinations and screenshot assets", () => {
  const ids = manualGuides.map((guide) => guide.id);
  assert.equal(new Set(ids).size, ids.length);
  for (const id of ["start", "projects", "inventory", "requests", "deliveries", "site-purchases", "purchases", "reports", "access", "account"]) assert.ok(ids.includes(id));
  for (const guide of manualGuides) {
    assert.match(guide.href, /^\/(?!\/)/);
    const pathname = guide.href.split("?")[0];
    assert.ok(existsSync(path.join(process.cwd(), "src/app/(workspace)", pathname, "page.tsx")), guide.href);
    if (!guide.figure) continue;
    assert.ok(existsSync(path.join(process.cwd(), "public", guide.figure.src)));
    for (const mark of guide.figure.marks) {
      assert.ok(mark.x >= 0 && mark.y >= 0 && mark.width > 0 && mark.height > 0);
      assert.ok(mark.x + mark.width <= 100 && mark.y + mark.height <= 100);
    }
  }
});
