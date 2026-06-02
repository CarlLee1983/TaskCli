import { expect, test } from "bun:test";
import { mkdtempSync, mkdirSync, writeFileSync, readFileSync, existsSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { runChecks } from "../../src/doctor/checks";
import { applyFixes } from "../../src/doctor/fixes";

function makeRepo(): string {
  const root = mkdtempSync(join(tmpdir(), "doctor-fix-"));
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

test("missing_dir：建回目錄，重跑乾淨", () => {
  const root = makeRepo();
  rmSync(join(root, ".taskcli/drafts"), { recursive: true });
  applyFixes(root, runChecks(root));
  expect(existsSync(join(root, ".taskcli/drafts"))).toBe(true);
  expect(runChecks(root).warnCount).toBe(0);
});

test("dangling dep：移除懸空相依，保留有效相依", () => {
  const root = makeRepo();
  writeTaskFile(root, "T-002", validTask("T-002"));
  writeTaskFile(root, "T-001", validTask("T-001", `depends_on: ["T-002","T-099"]\n`));
  const outcomes = applyFixes(root, runChecks(root));
  expect(outcomes.some((o) => o.code === "dep.dangling" && o.applied)).toBe(true);
  const after = readFileSync(join(root, ".taskcli/tasks/T-001.md"), "utf8");
  expect(after).toContain("T-002");
  expect(after).not.toContain("T-099");
});

test("id_mismatch：以檔名改寫 id", () => {
  const root = makeRepo();
  writeTaskFile(root, "T-007", validTask("T-008"));
  applyFixes(root, runChecks(root));
  const after = readFileSync(join(root, ".taskcli/tasks/T-007.md"), "utf8");
  expect(after).toContain(`id: "T-007"`);
  expect(runChecks(root).errorCount).toBe(0);
});

test("id_mismatch：目標 id 已被佔用時不修復（applied=false）", () => {
  const root = makeRepo();
  writeTaskFile(root, "T-007", validTask("T-007"));
  writeTaskFile(root, "T-008", validTask("T-007"));
  const before = readFileSync(join(root, ".taskcli/tasks/T-008.md"), "utf8");
  const outcomes = applyFixes(root, runChecks(root));
  const o = outcomes.find((x) => x.code === "task.id_mismatch" && x.target === "T-008");
  expect(o!.applied).toBe(false);
  expect(readFileSync(join(root, ".taskcli/tasks/T-008.md"), "utf8")).toBe(before);
});

test("不該 fix 的項目原封不動：壞 frontmatter 不被改", () => {
  const root = makeRepo();
  writeTaskFile(root, "T-001", "壞掉的內容");
  const before = readFileSync(join(root, ".taskcli/tasks/T-001.md"), "utf8");
  applyFixes(root, runChecks(root));
  expect(readFileSync(join(root, ".taskcli/tasks/T-001.md"), "utf8")).toBe(before);
});
