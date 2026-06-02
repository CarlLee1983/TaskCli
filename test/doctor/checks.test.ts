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

test("壞 frontmatter → task.parse_failed（error）", () => {
  const root = makeRepo();
  writeTaskFile(root, "T-001", "沒有 frontmatter 的內容");
  const report = runChecks(root);
  expect(codes(report)).toContain("task.parse_failed");
  expect(report.ok).toBe(false);
});

test("檔名與 id 不符 → task.id_mismatch（error, fixable）", () => {
  const root = makeRepo();
  writeTaskFile(root, "T-007", validTask("T-008"));
  const report = runChecks(root);
  const f = report.checks.find((c) => c.name === "tasks")!.findings
    .find((x) => x.code === "task.id_mismatch");
  expect(f).toBeDefined();
  expect(f!.target).toBe("T-007");
  expect(f!.fixable).toBe(true);
});

test("重複 id → task.duplicate_id（error）", () => {
  const root = makeRepo();
  writeTaskFile(root, "T-300", validTask("T-300"));
  writeTaskFile(root, "T-301", validTask("T-300"));
  const report = runChecks(root);
  const f = report.checks.find((c) => c.name === "tasks")!.findings
    .find((x) => x.code === "task.duplicate_id");
  expect(f).toBeDefined();
  expect(f!.target).toBe("T-300");
  expect(f!.fixable).toBe(false);
  expect(report.ok).toBe(false);
});

test("懸空相依 → dep.dangling（error, fixable）", () => {
  const root = makeRepo();
  writeTaskFile(root, "T-001", validTask("T-001", `depends_on: ["T-099"]\n`));
  const report = runChecks(root);
  const f = report.checks.find((c) => c.name === "deps")!.findings
    .find((x) => x.code === "dep.dangling");
  expect(f).toBeDefined();
  expect(f!.fixable).toBe(true);
  expect(f!.severity).toBe("error");
});

test("循環相依 → dep.cycle（error）", () => {
  const root = makeRepo();
  writeTaskFile(root, "T-001", validTask("T-001", `depends_on: ["T-002"]\n`));
  writeTaskFile(root, "T-002", validTask("T-002", `depends_on: ["T-001"]\n`));
  const report = runChecks(root);
  const f = report.checks.find((c) => c.name === "deps")!.findings
    .find((x) => x.code === "dep.cycle");
  expect(f).toBeDefined();
  expect(f!.message).toContain("→");
  expect(f!.severity).toBe("error");
  expect(f!.fixable).toBe(false);
});

test("相依於已取消 task → dep.on_cancelled（warn）", () => {
  const root = makeRepo();
  writeTaskFile(root, "T-001", validTask("T-001", `depends_on: ["T-002"]\n`));
  writeTaskFile(
    root,
    "T-002",
    validTask("T-002").replace(`status: "todo"`, `status: "cancelled"`),
  );
  const report = runChecks(root);
  const deps = report.checks.find((c) => c.name === "deps")!.findings;
  expect(deps.find((x) => x.code === "dep.on_cancelled")).toBeDefined();
});

test("history sidecar 對應 task 不存在 → history.orphan（warn）", () => {
  const root = makeRepo();
  mkdirSync(join(root, ".taskcli/history"), { recursive: true });
  const ev = { id: "E-001", task_id: "T-099", type: "note", created: "2026-06-02T10:00:00+08:00", body: "x" };
  writeFileSync(join(root, ".taskcli/history/T-099.jsonl"), `${JSON.stringify(ev)}\n`, "utf8");
  const report = runChecks(root);
  const f = report.checks.find((c) => c.name === "sidecars")!.findings
    .find((x) => x.code === "history.orphan");
  expect(f).toBeDefined();
  expect(f!.severity).toBe("warn");
});

test("history jsonl 壞行 → history.parse_failed（error）", () => {
  const root = makeRepo();
  mkdirSync(join(root, ".taskcli/history"), { recursive: true });
  writeTaskFile(root, "T-001", validTask("T-001"));
  writeFileSync(join(root, ".taskcli/history/T-001.jsonl"), "not-json\n", "utf8");
  const report = runChecks(root);
  expect(codes(report)).toContain("history.parse_failed");
});

test("transcript 解析失敗 → transcript.parse_failed（error）", () => {
  const root = makeRepo();
  writeFileSync(join(root, ".taskcli/transcripts/TR-001.md"), "沒有 frontmatter", "utf8");
  const report = runChecks(root);
  expect(codes(report)).toContain("transcript.parse_failed");
});
