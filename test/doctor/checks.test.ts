import { expect, test } from "bun:test";
import { runChecks } from "../../src/doctor/checks";
import { mkdtempSync, mkdirSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";

function makeRepo(): string {
  const root = mkdtempSync(join(tmpdir(), "doctor-"));
  mkdirSync(join(root, ".taskcli/tasks"), { recursive: true });
  mkdirSync(join(root, ".taskcli/drafts"), { recursive: true });
  mkdirSync(join(root, ".taskcli/transcripts"), { recursive: true });
  return root;
}

function writeTaskFile(root: string, fileId: string, content: string): void {
  writeFileSync(join(root, ".taskcli/tasks", `${fileId}.md`), content, "utf8");
}

function validTask(id: string, extra = ""): string {
  return `---\nid: ${JSON.stringify(id)}\ntitle: "t"\ntype: "feature"\nstatus: "todo"\npriority: "med"\ntags: []\n${extra}created: "2026-06-02T10:00:00+08:00"\nupdated: "2026-06-02T10:00:00+08:00"\n---\n`;
}

function codes(report: { checks: { findings: { code: string }[] }[] }): string[] {
  return report.checks.flatMap((c) => c.findings.map((f) => f.code));
}

test("乾淨 repo：ok、無 finding", () => {
  const root = makeRepo();
  const report = runChecks(root);
  expect(report.ok).toBe(true);
  expect(report.errorCount).toBe(0);
  expect(report.warnCount).toBe(0);
});
