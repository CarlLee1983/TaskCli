import { runChecks } from "../doctor/checks";
import { applyFixes } from "../doctor/fixes";
import { formatReport, formatJson, exitCodeFor } from "../doctor/report";
import { listTaskIds } from "../storage/tasks";
import type { FixOutcome } from "../doctor/types";

export interface DoctorOpts {
  fix?: boolean;
  json?: boolean;
}

export function runDoctor(root: string, opts: DoctorOpts): { output: string; exitCode: number } {
  let report = runChecks(root);
  let fixes: FixOutcome[] | undefined;
  if (opts.fix) {
    fixes = applyFixes(root, report);
    report = runChecks(root);
  }
  const taskCount = listTaskIds(root).length;
  const output = opts.json ? formatJson(report, fixes) : formatReport(report, taskCount, fixes);
  return { output, exitCode: exitCodeFor(report) };
}
