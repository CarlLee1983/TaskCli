import type { DoctorReport, Finding, FixOutcome, Severity } from "./types";

const ICON: Record<Severity, string> = { error: "✖", warn: "⚠" };

function formatFinding(f: Finding): string {
  const fixTag = f.fixable ? "  [可 --fix]" : "";
  return `  ${ICON[f.severity]} ${f.target}  ${f.message}${fixTag}`;
}

export function formatReport(report: DoctorReport, taskCount: number, fixes?: FixOutcome[]): string {
  const lines: string[] = ["🔎 taskcli doctor", ""];
  if (fixes && fixes.length > 0) {
    lines.push("▎已套用修復");
    for (const fx of fixes) {
      const mark = fx.applied ? "✔" : "·";
      lines.push(`  ${mark} ${fx.target}  ${fx.action}`);
    }
    lines.push("");
  }
  for (const c of report.checks) {
    if (c.findings.length === 0) continue;
    lines.push(`▎${c.name}`);
    for (const f of c.findings) lines.push(formatFinding(f));
    lines.push("");
  }
  if (report.errorCount === 0 && report.warnCount === 0) {
    lines.push(`✅ 一切正常（${taskCount} tasks、0 問題）`);
  } else {
    const anyFixable = report.checks.some((c) => c.findings.some((f) => f.fixable));
    // 兩句中文直接相接（全形句號後接下一句）在排版上是正確的，勿插入空白或換行
    let summary = `摘要：${report.errorCount} error、${report.warnCount} warn。`;
    if (anyFixable) summary += "有可自動修復項，可執行 `taskcli doctor --fix`。";
    lines.push(summary);
  }
  return lines.join("\n");
}

export function formatJson(report: DoctorReport, fixes?: FixOutcome[]): string {
  return JSON.stringify(fixes ? { ...report, fixes } : report, null, 2);
}

export function exitCodeFor(report: DoctorReport): number {
  return report.errorCount > 0 ? 1 : 0;
}
