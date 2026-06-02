import { expect, test } from "bun:test";
import { formatReport, formatJson, exitCodeFor } from "../../src/doctor/report";
import type { DoctorReport } from "../../src/doctor/types";

const CLEAN: DoctorReport = { ok: true, errorCount: 0, warnCount: 0, checks: [] };

const WITH_ERROR: DoctorReport = {
  ok: false,
  errorCount: 1,
  warnCount: 1,
  checks: [
    { name: "deps", findings: [
      { code: "dep.dangling", severity: "error", target: "T-001", message: "懸空相依 T-099", fixable: true },
      { code: "dep.on_cancelled", severity: "warn", target: "T-002", message: "相依於已取消的 T-005", fixable: false },
    ] },
  ],
};

test("乾淨報告：顯示一切正常與 task 數", () => {
  const out = formatReport(CLEAN, 12);
  expect(out).toContain("一切正常");
  expect(out).toContain("12 tasks");
});

test("有問題報告：分組、可 --fix 標記、摘要", () => {
  const out = formatReport(WITH_ERROR, 5);
  expect(out).toContain("▎deps");
  expect(out).toContain("  ✖ T-001  懸空相依 T-099  [可 --fix]");
  expect(out).toContain("[可 --fix]");
  expect(out).toContain("1 error");
  expect(out).toContain("1 warn");
  expect(out).toContain("taskcli doctor --fix");
});

test("exit code：有 error 回 1，否則 0", () => {
  expect(exitCodeFor(WITH_ERROR)).toBe(1);
  expect(exitCodeFor(CLEAN)).toBe(0);
  expect(exitCodeFor({ ...CLEAN, warnCount: 3 })).toBe(0);
});

test("formatJson：--fix 模式含 fixes 欄位", () => {
  const json = JSON.parse(formatJson(CLEAN, [
    { code: "layout.missing_dir", target: ".taskcli/drafts", action: "建立目錄", applied: true },
  ]));
  expect(json.fixes).toHaveLength(1);
  expect(json.fixes[0].applied).toBe(true);
  expect(json.fixes[0].target).toBe(".taskcli/drafts");
});
