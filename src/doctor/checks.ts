import { readFileSync } from "node:fs";
import { listTaskIds, taskPath } from "../storage/tasks";
import { parseTask } from "../model/frontmatter";
import type { Task } from "../model/types";
import type { CheckResult, DoctorReport } from "./types";

interface LoadedTask {
  fileId: string;
  task: Task | null;
  parseError: string | null;
}

function loadTasks(root: string): LoadedTask[] {
  return listTaskIds(root).map((fileId) => {
    try {
      const raw = readFileSync(taskPath(root, fileId), "utf8");
      return { fileId, task: parseTask(raw), parseError: null };
    } catch (e) {
      return { fileId, task: null, parseError: e instanceof Error ? e.message : String(e) };
    }
  });
}

function checkLayout(_root: string): CheckResult {
  return { name: "layout", findings: [] };
}
function checkTasks(_loaded: LoadedTask[]): CheckResult {
  return { name: "tasks", findings: [] };
}
function checkDeps(_loaded: LoadedTask[]): CheckResult {
  return { name: "deps", findings: [] };
}
function checkSidecars(_root: string, _loaded: LoadedTask[]): CheckResult {
  return { name: "sidecars", findings: [] };
}

export function runChecks(root: string): DoctorReport {
  const loaded = loadTasks(root);
  const checks: CheckResult[] = [
    checkLayout(root),
    checkTasks(loaded),
    checkDeps(loaded),
    checkSidecars(root, loaded),
  ];
  let errorCount = 0;
  let warnCount = 0;
  for (const c of checks) {
    for (const f of c.findings) {
      if (f.severity === "error") errorCount++;
      else warnCount++;
    }
  }
  return { ok: errorCount === 0, errorCount, warnCount, checks };
}
