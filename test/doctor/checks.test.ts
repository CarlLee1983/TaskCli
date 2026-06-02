import { expect, test } from "bun:test";
import { runChecks } from "../../src/doctor/checks";
import { mkdtempSync, mkdirSync, writeFileSync, rmSync } from "node:fs";
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

test("缺少 transcripts 目錄 → layout.missing_dir（warn, fixable）", () => {
  const root = makeRepo();
  rmSync(join(root, ".taskcli/transcripts"), { recursive: true });
  const report = runChecks(root);
  const f = report.checks.find((c) => c.name === "layout")!.findings
    .find((x) => x.code === "layout.missing_dir");
  expect(f).toBeDefined();
  expect(f!.severity).toBe("warn");
  expect(f!.fixable).toBe(true);
  expect(report.warnCount).toBe(1);
});

test("config.json 壞掉 → layout.config_unparsable（error）", () => {
  const root = makeRepo();
  writeFileSync(join(root, ".taskcli/config.json"), "not-json", "utf8");
  const report = runChecks(root);
  expect(codes(report)).toContain("layout.config_unparsable");
  expect(report.ok).toBe(false);
});

test("config.defaultType 非法 → layout.config_invalid_enum（warn）", () => {
  const root = makeRepo();
  writeFileSync(join(root, ".taskcli/config.json"), JSON.stringify({ defaultType: "bogus" }), "utf8");
  const report = runChecks(root);
  expect(codes(report)).toContain("layout.config_invalid_enum");
});

test("config.defaultPriority 非法 → layout.config_invalid_enum（warn）", () => {
  const root = makeRepo();
  writeFileSync(
    join(root, ".taskcli/config.json"),
    JSON.stringify({ defaultPriority: "urgent" }),
    "utf8",
  );
  const report = runChecks(root);
  expect(codes(report)).toContain("layout.config_invalid_enum");
  expect(report.warnCount).toBe(1);
});
