import assert from "node:assert/strict";
import { readFileSync, readdirSync, existsSync } from "node:fs";
import { join, dirname, resolve } from "node:path";
import test from "node:test";

function pages(directory: string): string[] {
  return readdirSync(directory, { withFileTypes: true }).flatMap(entry => {
    const path = join(directory, entry.name);
    return entry.isDirectory() ? pages(path) : entry.name === "page.tsx" ? [path] : [];
  });
}

test("every intercepted record has the same panel presentation on hard navigation", () => {
  const workspace = resolve("src/app/(workspace)");
  const recordPages = pages(join(workspace, "@modal")).filter(path => readFileSync(path, "utf8").includes("<RecordDetailPanel"));
  assert.ok(recordPages.length >= 16, "the existing record families remain covered");
  for (const intercepted of recordPages) {
    const content = readFileSync(intercepted, "utf8");
    const canonical = content.match(/import DetailPage from "@\/app\/\(workspace\)\/(.+)\/page"/);
    assert.ok(canonical, `resolve the canonical content for ${intercepted}`);
    const directory = join(workspace, canonical[1]);
    const layout = join(directory, "layout.tsx");
    assert.ok(existsSync(layout), `refresh must retain the record panel: ${canonical[1]}`);
    const shell = readFileSync(layout, "utf8");
    assert.match(shell, /<CanonicalRecordLayout/);
    assert.match(shell, /closeHref=/, "a direct link must close to a local list instead of leaving the application");
    assert.ok(existsSync(join(directory, "error.tsx")), "record errors stay inside the panel");
    assert.ok(existsSync(join(directory, "not-found.tsx")), "unavailable records stay inside the panel");
    const list = shell.match(/import ListPage from "@\/app\/\(workspace\)\/(.+)\/page"/);
    assert.ok(list, "the background reuses its authorized list");
    assert.ok(existsSync(join(workspace, list[1], "page.tsx")), dirname(layout));
  }
});
