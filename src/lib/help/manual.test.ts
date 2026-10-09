import assert from "node:assert/strict";
import { existsSync, readdirSync } from "node:fs";
import path from "node:path";
import { test } from "node:test";
import type { AppRole } from "@/types/database";
import { getManualGuides, manualGuides, roleResponsibilities } from "./manual";
import { legacyManualDestination, manualGroups, searchManualTopics, toManualTopics } from "./navigation";
import { getGuideFigures } from "./screenshots";
import sharp from "sharp";

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
  const search = (role: AppRole, query: string) => searchManualTopics(toManualTopics(getManualGuides([role])), query);
  assert.ok(search("finance", "  SUPPLIER   payment ").some((guide) => guide.id === "purchases"));
  assert.ok(search("engineer", "receipt date").some((guide) => guide.id === "site-purchases"));
  assert.deepEqual(search("foreman", "supplier-price posting"), []);
  assert.deepEqual(search("admin", "[a-z]*"), []);
  assert.ok(!search("engineer", "Admin setup").some((guide) => guide.id === "access"));
  assert.equal(search("admin", "").length, getManualGuides(["admin"]).length);
});

test("manual keeps old topic identifiers and uses real internal destinations", () => {
  const ids = manualGuides.map((guide) => guide.id);
  assert.equal(new Set(ids).size, ids.length);
  for (const id of ["start", "projects", "inventory", "requests", "deliveries", "site-purchases", "purchases", "reports", "access", "account"]) assert.ok(ids.includes(id));
  for (const guide of manualGuides) {
    assert.match(guide.href, /^\/(?!\/)/);
    const pathname = guide.href.split("?")[0];
    assert.ok(existsSync(path.join(process.cwd(), "src/app/(workspace)", pathname, "page.tsx")), guide.href);
  }
});

test("every documentation topic has one ordered navigation entry", () => {
  const topics = toManualTopics(manualGuides);
  assert.equal(topics.length, manualGuides.length);
  assert.equal(new Set(topics.map((topic) => topic.id)).size, topics.length);
  assert.equal(topics[0].id, "start");
  for (let index = 1; index < topics.length; index++) {
    assert.ok(manualGroups.indexOf(topics[index].group) >= manualGroups.indexOf(topics[index - 1].group));
  }
  assert.throws(() => toManualTopics([{ ...manualGuides[0], id: "unmapped" }]), /Missing manual navigation/);
});

test("legacy bookmarks redirect to allowed topics with safely encoded search", () => {
  const allowed = getManualGuides(["foreman"]).map((guide) => guide.id);
  assert.equal(legacyManualDestination("#requests", allowed), "/manual/requests");
  assert.equal(legacyManualDestination("#site%2Dpurchases", allowed), "/manual/start");
  for (const hash of ["#access", "#unknown", "#%E0%A4%A", "#//example.com", ""]) {
    assert.equal(legacyManualDestination(hash, allowed), "/manual/start");
  }
  assert.equal(legacyManualDestination("#reports", allowed, " receipt & stock "), "/manual/reports?q=receipt+%26+stock");
  assert.equal(new URL(legacyManualDestination("", allowed, "x".repeat(120)), "https://example.com").searchParams.get("q")?.length, 100);
});

test("annotated screenshots have correct dimensions, valid callouts and no unused assets", async () => {
  const figures = manualGuides.flatMap((guide) => getGuideFigures(guide));
  assert.ok(figures.length >= 17);
  assert.equal(new Set(figures.map((figure) => figure.src)).size, figures.length);
  for (const figure of figures) {
    const file = path.join(process.cwd(), "public", figure.src);
    assert.ok(existsSync(file), figure.src);
    const metadata = await sharp(file).metadata();
    assert.equal(metadata.width, figure.width, figure.src);
    assert.equal(metadata.height, figure.height, figure.src);
    assert.ok(figure.alt && figure.title && figure.marks.length > 0);
    for (const mark of figure.marks) {
      assert.ok(mark.x >= 0 && mark.y >= 0 && mark.width > 0 && mark.height > 0);
      assert.ok(mark.x + mark.width <= 100 && mark.y + mark.height <= 100);
    }
  }
  assert.deepEqual(readdirSync(path.join(process.cwd(), "public/manual")).sort(), figures.map((figure) => path.basename(figure.src)).sort());
});
